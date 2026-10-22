param(
  [string]$Ip = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$certDir = Join-Path $root "certs"
$publicDir = Join-Path $root "public"
New-Item -ItemType Directory -Path $certDir -Force | Out-Null

$openssl = (Get-Command openssl -ErrorAction Stop).Source
if (-not $Ip) {
  $Ip = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
    Sort-Object InterfaceMetric |
    Select-Object -First 1).IPAddress
}
if (-not $Ip) {
  throw "No IPv4 LAN address found. Pass -Ip explicitly."
}

$caKey = Join-Path $certDir "ca.key"
$caCert = Join-Path $certDir "ca.crt"
$serverKey = Join-Path $certDir "server.key"
$serverCsr = Join-Path $certDir "server.csr"
$serverCert = Join-Path $certDir "server.crt"
$configPath = Join-Path $certDir "server.cnf"
$iosCa = Join-Path $publicDir "wk8-root-ca.cer"

@"
[req]
default_bits = 2048
prompt = no
distinguished_name = dn

[dn]
CN = wenku8.local
O = wenku8-web

[v3_req]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid,issuer

[alt_names]
DNS.1 = localhost
DNS.2 = wenku8.local
IP.1 = 127.0.0.1
IP.2 = $Ip
"@ | Set-Content -LiteralPath $configPath -Encoding ASCII

$caExists = (Test-Path -LiteralPath $caKey) -and (Test-Path -LiteralPath $caCert)
if (-not $caExists) {
  & $openssl req -x509 -newkey rsa:3072 -nodes -sha256 -days 3650 `
    -keyout $caKey -out $caCert -subj "/CN=Wenku8 Local CA/O=wenku8-web" `
    -addext "basicConstraints=critical,CA:TRUE" `
    -addext "keyUsage=critical,keyCertSign,cRLSign" `
    -addext "subjectKeyIdentifier=hash"
  if ($LASTEXITCODE -ne 0) { throw "CA generation failed" }
}

& $openssl req -newkey rsa:2048 -nodes -sha256 `
  -keyout $serverKey -out $serverCsr -config $configPath
if ($LASTEXITCODE -ne 0) { throw "Server CSR generation failed" }

& $openssl x509 -req -in $serverCsr -CA $caCert -CAkey $caKey -CAcreateserial `
  -days 825 -sha256 -extfile $configPath -extensions v3_req -out $serverCert
if ($LASTEXITCODE -ne 0) { throw "Server certificate signing failed" }

& $openssl x509 -in $caCert -outform der -out $iosCa
if ($LASTEXITCODE -ne 0) { throw "CA export failed" }

Remove-Item -LiteralPath $serverCsr -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $certDir "ca.srl") -ErrorAction SilentlyContinue

Write-Output "cert_dir=$certDir"
Write-Output "server_ip=$Ip"
Write-Output "fingerprint=$((Get-FileHash -Algorithm SHA256 -LiteralPath $serverCert).Hash)"
Write-Output "ca_reused=$caExists"
Write-Output "ca_cert=$caCert"
Write-Output "ios_ca=$iosCa"
Write-Output "windows_trust=Install ca.crt manually into CurrentUser Root if prompted."
