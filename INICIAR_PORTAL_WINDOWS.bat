@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ================================================
echo   COMEX LAB ND2 - PORTAL LOCAL
echo ================================================
echo.
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 iniciar_portal.py
) else (
  where python >nul 2>nul
  if %errorlevel%==0 (
    python iniciar_portal.py
  ) else (
    echo ERRO: Python 3.10 ou superior nao encontrado.
    echo Instale o Python em https://www.python.org/downloads/
    echo Durante a instalacao marque "Add Python to PATH".
  )
)
echo.
echo O servidor parou ou ocorreu um erro.
pause
