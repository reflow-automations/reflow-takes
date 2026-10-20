$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
Write-Host 'Reflow Takes: http://127.0.0.1:8767/takes.html'
Write-Host 'Gebruik Chrome of Edge. Stop deze lokale server met Ctrl+C.'
py -m http.server 8767 --bind 127.0.0.1 --directory dist
