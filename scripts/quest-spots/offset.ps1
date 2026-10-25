# Finds the shift between two pictures of the same base map at the same scale but cropped
# differently: tries every offset in a window on a pixel sample and prints the best ones.
# A pixel (x, y) in -Quest is (x + dx, y + dy) in -Base.
# Usage: powershell -File scripts/quest-spots/offset.ps1 -Quest q.png -Base b.png [-Range 80] [-Gx 1000 -Gy 1000]
param(
  [Parameter(Mandatory = $true)][string]$Quest,
  [Parameter(Mandatory = $true)][string]$Base,
  [int]$Range = 80,
  [int]$Gx = 0, [int]$Gy = 0
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
$code = @'
public static class Shift {
  public static string Run(byte[] a, int aw, int ah, int astr, byte[] b, int bw, int bh, int bstr, int range) {
    var best = new System.Collections.Generic.List<System.Tuple<double, int, int>>();
    for (int dy = -range; dy <= range; dy++) for (int dx = -range; dx <= range; dx++) {
      int same = 0, n = 0;
      for (int y = 40; y < ah - 40; y += 37) for (int x = 40; x < aw - 40; x += 37) {
        int bx = x + dx, by = y + dy;
        if (bx < 0 || by < 0 || bx >= bw || by >= bh) continue;
        int i = y * astr + x * 3, j = by * bstr + bx * 3;
        int d = System.Math.Abs(a[i] - b[j]) + System.Math.Abs(a[i + 1] - b[j + 1]) + System.Math.Abs(a[i + 2] - b[j + 2]);
        if (d <= 24) same++;
        n++;
      }
      if (n > 0) best.Add(System.Tuple.Create((double)same / n, dx, dy));
    }
    best.Sort((p, q) => q.Item1.CompareTo(p.Item1));
    var s = new System.Text.StringBuilder();
    for (int k = 0; k < 5 && k < best.Count; k++) s.AppendFormat("dx {0} dy {1}: {2:F2}\n", best[k].Item2, best[k].Item3, best[k].Item1);
    return s.ToString();
  }
}
'@
Add-Type -TypeDefinition $code
$q = Read-Pixels $Quest
$b = Read-Pixels $Base
Write-Output ([Shift]::Run($q.Bytes, $q.W, $q.H, $q.Stride, $b.Bytes, $b.W, $b.H, $b.Stride, $Range))
