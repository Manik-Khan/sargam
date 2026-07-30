@echo off
net session >nul 2>nul
if errorlevel 1 (
  echo Right-click this file and choose "Run as administrator."
  pause
  exit /b 1
)

netsh advfirewall firewall delete rule name="Sargam Waveform Worker" >nul 2>nul
netsh advfirewall firewall add rule ^
  name="Sargam Waveform Worker" ^
  dir=in action=allow protocol=TCP localport=8091 profile=private

if errorlevel 1 (
  echo Windows Firewall could not add the rule.
  pause
  exit /b 1
)

echo Windows Firewall now allows Sargam Waveform Worker on private networks.
pause
