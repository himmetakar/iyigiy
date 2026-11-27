# Gemini ile görsel üretir. Anahtar key.txt dosyasından okunur, ekrana yazılmaz.
# Örnek: powershell -File tools\gen.ps1 -Prompt "..." -Out assets\gen\a.png -Ref assets\gen\b.png
param(
  [Parameter(Mandatory)][string]$Prompt,
  [Parameter(Mandatory)][string]$Out,
  [string[]]$Ref = @(),
  [string]$Aspect = '4:5',
  [string]$Size = '2K',
  [string]$Model = 'gemini-3-pro-image'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$key = (Get-Content (Join-Path $root 'key.txt') -Raw).Trim()
$parts = @()
$Ref = @($Ref | ForEach-Object { $_ -split ',' } | Where-Object { $_ })
foreach ($r in $Ref) {
  $p = Join-Path $root $r
  $mime = if ($p -match '\.jpe?g$') { 'image/jpeg' } else { 'image/png' }
  $parts += @{ inlineData = @{ mimeType = $mime; data = [Convert]::ToBase64String([IO.File]::ReadAllBytes($p)) } }
}
$parts += @{ text = $Prompt }
$body = @{
  contents = @(@{ role = 'user'; parts = $parts })
  generationConfig = @{ responseModalities = @('IMAGE'); imageConfig = @{ aspectRatio = $Aspect; imageSize = $Size } }
} | ConvertTo-Json -Depth 8 -Compress
$bytes = [Text.Encoding]::UTF8.GetBytes($body)
$url = "https://generativelanguage.googleapis.com/v1beta/models/${Model}:generateContent"
try {
  $res = Invoke-RestMethod -Uri $url -Method Post -Headers @{ 'x-goog-api-key' = $key } -ContentType 'application/json; charset=utf-8' -Body $bytes -TimeoutSec 240
} catch {
  $msg = $_.ErrorDetails.Message; if (-not $msg) { $msg = $_.Exception.Message }
  Write-Output "HATA: $msg"; exit 1
}
$img = $res.candidates[0].content.parts | Where-Object { $_.inlineData } | Select-Object -First 1
if (-not $img) { Write-Output ("GORSEL YOK: " + ($res | ConvertTo-Json -Depth 6 -Compress).Substring(0, 600)); exit 1 }
$outPath = Join-Path $root $Out
New-Item -ItemType Directory -Force (Split-Path -Parent $outPath) | Out-Null
[IO.File]::WriteAllBytes($outPath, [Convert]::FromBase64String($img.inlineData.data))
Write-Output ("OK " + $Out + " " + [math]::Round((Get-Item $outPath).Length / 1KB) + " KB " + $img.inlineData.mimeType)
