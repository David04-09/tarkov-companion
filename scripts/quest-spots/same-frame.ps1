# Tells whether two pictures are the same base map (same frame, different markings): samples a
# grid of pixels and prints the share that are nearly equal. Same frame ~ 0.7 or more.
# Usage: powershell -File scripts/quest-spots/same-frame.ps1 -A one.png -B two.png
param([Parameter(Mandatory = $true)][string]$A, [Parameter(Mandatory = $true)][string]$B)
Add-Type -AssemblyName System.Drawing
$ia = New-Object System.Drawing.Bitmap ((Resolve-Path $A).Path)
$ib = New-Object System.Drawing.Bitmap ((Resolve-Path $B).Path)
if ($ia.Width -ne $ib.Width -or $ia.Height -ne $ib.Height) { Write-Output "different sizes $($ia.Width)x$($ia.Height) vs $($ib.Width)x$($ib.Height)"; exit }
$same = 0; $n = 0
for ($y = 5; $y -lt $ia.Height; $y += [int]($ia.Height / 60)) {
  for ($x = 5; $x -lt $ia.Width; $x += [int]($ia.Width / 60)) {
    $p = $ia.GetPixel($x, $y); $q = $ib.GetPixel($x, $y)
    $d = [math]::Abs($p.R - $q.R) + [math]::Abs($p.G - $q.G) + [math]::Abs($p.B - $q.B)
    if ($d -le 24) { $same++ }
    $n++
  }
}
Write-Output ("{0:N2} of {1} samples equal" -f ($same / $n), $n)
$ia.Dispose(); $ib.Dispose()
