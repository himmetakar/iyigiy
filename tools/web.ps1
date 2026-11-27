# assets\gen içindeki büyük PNG'leri web için küçültüp assets\img içine JPG olarak yazar.
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'assets\img'; New-Item -ItemType Directory -Force $out | Out-Null
$enc = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object Drawing.Imaging.EncoderParameters 1
$ep.Param[0] = New-Object Drawing.Imaging.EncoderParameter ([Drawing.Imaging.Encoder]::Quality, [long]84)
Get-ChildItem (Join-Path $root 'assets\gen') -Filter *.png | Where-Object { $_.Name -ne 'test.png' } | ForEach-Object {
  $w = if ($_.Name -like 'gardirop*') { 2400 } else { 1000 }
  $src = [Drawing.Image]::FromFile($_.FullName)
  $h = [int]($src.Height * $w / $src.Width)
  $bmp = New-Object Drawing.Bitmap $w, $h
  $g = [Drawing.Graphics]::FromImage($bmp); $g.InterpolationMode = 'HighQualityBicubic'
  $g.DrawImage($src, 0, 0, $w, $h); $g.Dispose(); $src.Dispose()
  $dst = Join-Path $out ($_.BaseName + '.jpg')
  $bmp.Save($dst, $enc, $ep); $bmp.Dispose()
  "{0} {1}x{2} {3} KB" -f $_.BaseName, $w, $h, [math]::Round((Get-Item $dst).Length / 1KB)
}
