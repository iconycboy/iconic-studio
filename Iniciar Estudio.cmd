@echo off
rem Abre Iconic Studio (si el acceso directo del escritorio falla, usa este archivo)
cd /d "%~dp0"
uv run app.py
if errorlevel 1 pause
