# tests_e2e_py — Playwright (Python) para Kioscos

Pruebas E2E **sin Node/npm**, usando **pytest + Playwright for Python** con:
- **Capturas** en cada paso clave,
- **Video** por test,
- **Trace** (paso a paso con screenshots),
- **Reporte HTML** con evidencias.

## 1) Instalación
```bash
cd tests_e2e_py
pip install -r requirements.txt
python -m playwright install --with-deps
```

## 2) Ejecutar
```bash
pytest -v --html=report.html --self-contained-html
```

> Abre `report.html` para ver capturas, videos (descargables) y trazas.

## 3) Cambiar URL base (opcional)
Por defecto se usa producción:
```
https://encuestas-reportes.onrender.com
```
Para apuntar a local:
```bash
BASE_URL=http://localhost:8000 pytest -v --html=report.html --self-contained-html
```

## 4) Dispositivos
Se ejecuta por defecto en **Desktop Chrome (Chromium)**, **iPad Safari (WebKit)** y **Android Chrome (Chromium)**.
Puedes limitar con:
```bash
DEVICES=Desktop pytest -v --html=report.html --self-contained-html
DEVICES=Desktop,iPad pytest -v --html=report.html --self-contained-html
```

## 5) Qué valida
- Carga de pantalla principal (Comedor / Transporte).
- Flujo feliz con motivo normal (positivo).
- Flujo **“Otro”**: Enter en *empleado* → Enter en *comentario* → **¡Gracias!**.
- **Cola offline** básica (simulación de sin conexión y reintento).
