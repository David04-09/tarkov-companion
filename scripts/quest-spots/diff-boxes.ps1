# Finds the markings a quest picture adds to a base map it shares a frame with: compares the two
# in blocks and prints the bounding boxes (full-size pixels) of the areas that differ, largest first.
# Usage: powershell -File scripts/quest-spots/diff-boxes.ps1 -Quest quest.png -Base base.png [-Block 8] [-Min 2]
param(
  [Parameter(Mandatory = $true)][string]$Quest,
  [Parameter(Mandatory = $true)][string]$Base,
  [int]$Block = 8,
  [int]$Min = 2
)
Add-Type -AssemblyName System.Drawing
function Read-Pixels([string]$file) {
  $bmp = New-Object System.Drawing.Bitmap ((Resolve-Path $file).Path)
  $rect = New-Object System.Drawing.Rectangle 0, 0, $bmp.Width, $bmp.Height
  $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $bytes = New-Object byte[] ($data.Stride * $bmp.Height)
  [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
  $out = @{ W = $bmp.Width; H = $bmp.Height; Stride = $data.Stride; Bytes = $bytes }
  $bmp.UnlockBits($data); $bmp.Dispose()
  return $out
}
$q = Read-Pixels $Quest
$b = Read-Pixels $Base
if ($q.W -ne $b.W -or $q.H -ne $b.H) { Write-Output 'different sizes'; exit }
$bw = [math]::Ceiling($q.W / $Block); $bh = [math]::Ceiling($q.H / $Block)
$diff = New-Object 'bool[,]' $bw, $bh
$code = @'
public static class BlockDiff {
  public static bool[,] Run(byte[] a, byte[] b, int w, int h, int stride, int block) {
    int bw = (w + block - 1) / block, bh = (h + block - 1) / block;
    var count = new int[bw, bh];
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
      int i = y * stride + x * 3;
      int d = System.Math.Abs(a[i] - b[i]) + System.Math.Abs(a[i + 1] - b[i + 1]) + System.Math.Abs(a[i + 2] - b[i + 2]);
      if (d > 60) count[x / block, y / block]++;
    }
    var o = new bool[bw, bh];
    for (int x = 0; x < bw; x++) for (int y = 0; y < bh; y++) o[x, y] = count[x, y] >= block * block / 6;
    return o;
  }
}
'@
Add-Type -TypeDefinition $code
$diff = [BlockDiff]::Run($q.Bytes, $b.Bytes, $q.W, $q.H, $q.Stride, $Block)
$seen = New-Object 'bool[,]' $bw, $bh
$boxes = @()
for ($x = 0; $x -lt $bw; $x++) {
  for ($y = 0; $y -lt $bh; $y++) {
    if (-not $diff[$x, $y] -or $seen[$x, $y]) { continue }
    $stack = New-Object System.Collections.Stack
    $stack.Push(@($x, $y)); $seen[$x, $y] = $true
    $x0 = $x; $x1 = $x; $y0 = $y; $y1 = $y; $n = 0
    while ($stack.Count) {
      $c = $stack.Pop(); $n++
      if ($c[0] -lt $x0) { $x0 = $c[0] }; if ($c[0] -gt $x1) { $x1 = $c[0] }
      if ($c[1] -lt $y0) { $y0 = $c[1] }; if ($c[1] -gt $y1) { $y1 = $c[1] }
      foreach ($d in @(@(1, 0), @(-1, 0), @(0, 1), @(0, -1), @(1, 1), @(-1, -1), @(1, -1), @(-1, 1), @(2, 0), @(-2, 0), @(0, 2), @(0, -2))) {
        $nx = $c[0] + $d[0]; $ny = $c[1] + $d[1]
        if ($nx -lt 0 -or $ny -lt 0 -or $nx -ge $bw -or $ny -ge $bh) { continue }
        if ($diff[$nx, $ny] -and -not $seen[$nx, $ny]) { $seen[$nx, $ny] = $true; $stack.Push(@($nx, $ny)) }
      }
    }
    if ($n -ge $Min) { $boxes += [pscustomobject]@{ X = $x0 * $Block; Y = $y0 * $Block; W = ($x1 - $x0 + 1) * $Block; H = ($y1 - $y0 + 1) * $Block; Blocks = $n } }
  }
}
$boxes | Sort-Object Blocks -Descending | Select-Object -First 25 | ForEach-Object { "{0},{1} {2}x{3} centre {4},{5} ({6} blocks)" -f $_.X, $_.Y, $_.W, $_.H, [int]($_.X + $_.W / 2), [int]($_.Y + $_.H / 2), $_.Blocks }
