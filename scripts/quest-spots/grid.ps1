# Draws a labelled pixel grid over (a crop of) a picture so positions can be read off it in the
# picture's own pixels. Usage:
#   powershell -File scripts/quest-spots/grid.ps1 -In map.png -Out grid.png [-X 0 -Y 0 -W 0 -H 0] [-Step 100] [-Scale 1]
# X/Y/W/H pick the crop in original pixels (W/H 0 = to the edge); Step is the grid spacing in
# original pixels; Scale enlarges the crop for reading small details.
param(
  [Parameter(Mandatory = $true)][string]$In,
  [Parameter(Mandatory = $true)][string]$Out,
  [int]$X = 0, [int]$Y = 0, [int]$W = 0, [int]$H = 0,
  [int]$Step = 100,
  [double]$Scale = 1
)
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile((Resolve-Path $In))
if ($W -le 0) { $W = $src.Width - $X }
if ($H -le 0) { $H = $src.Height - $Y }
$ow = [int]($W * $Scale); $oh = [int]($H * $Scale)
$bmp = New-Object System.Drawing.Bitmap $ow, $oh
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($src, (New-Object System.Drawing.Rectangle 0, 0, $ow, $oh), (New-Object System.Drawing.Rectangle $X, $Y, $W, $H), [System.Drawing.GraphicsUnit]::Pixel)
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(170, 255, 0, 255)), 1
$font = New-Object System.Drawing.Font 'Arial', 10, ([System.Drawing.FontStyle]::Bold)
$fg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 255, 0))
$bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(190, 0, 0, 0))
$first = [math]::Ceiling($X / $Step) * $Step
for ($v = $first; $v -le $X + $W; $v += $Step) {
  $px = [int](($v - $X) * $Scale)
  $g.DrawLine($pen, $px, 0, $px, $oh)
  $g.FillRectangle($bg, $px + 1, 0, 34, 14); $g.DrawString("$v", $font, $fg, $px + 1, 0)
}
$first = [math]::Ceiling($Y / $Step) * $Step
for ($v = $first; $v -le $Y + $H; $v += $Step) {
  $py = [int](($v - $Y) * $Scale)
  $g.DrawLine($pen, 0, $py, $ow, $py)
  $g.FillRectangle($bg, 0, $py + 1, 34, 14); $g.DrawString("$v", $font, $fg, 0, $py + 1)
}
$bmp.Save([System.IO.Path]::GetFullPath((Join-Path (Get-Location) $Out)), [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose(); $src.Dispose()
Write-Output "$Out ${ow}x${oh} (original $($X)..$($X + $W) x $($Y)..$($Y + $H))"
