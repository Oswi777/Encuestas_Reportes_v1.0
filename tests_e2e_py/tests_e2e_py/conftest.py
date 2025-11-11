import os
import re
import pathlib
import pytest
from datetime import datetime
from typing import Generator, Tuple, Optional
from playwright.sync_api import sync_playwright, Browser, BrowserContext, Page

DEFAULT_BASE = os.environ.get("BASE_URL", "https://encuestas-reportes.onrender.com")

# Dispositivos y navegadores
DEVICE_MATRIX = [
    ("Desktop Chrome", "chromium", None),
    ("iPad Safari",    "webkit",  "iPad (gen 7)"),
    ("Android Chrome", "chromium","Pixel 7"),
]

def selected_devices():
    env = os.environ.get("DEVICES", "").strip()
    if not env:
        return DEVICE_MATRIX
    wanted = {s.strip().lower() for s in env.split(",") if s.strip()}
    out = []
    for name, engine, dev in DEVICE_MATRIX:
        key = name.split()[0].lower()  # Desktop / iPad / Android
        if (name.lower() in wanted) or (key in wanted):
            out.append((name, engine, dev))
    return out or DEVICE_MATRIX

def sanitize(s: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9._-]+", "_", s.strip())
    return s[:200]

@pytest.fixture(scope="session")
def base_url() -> str:
    return DEFAULT_BASE

@pytest.fixture(scope="session")
def _pw():
    with sync_playwright() as p:
        yield p

@pytest.fixture(params=selected_devices(), scope="session")
def device_def(request, _pw):
    name, engine, device_name = request.param
    browser_type = getattr(_pw, engine)  # chromium / webkit
    device = _pw.devices.get(device_name) if device_name else None
    return (name, browser_type, device)

@pytest.fixture(scope="function")
def browser_context_tmpdir(request, device_def, tmp_path_factory):
    # Carpeta de artefactos por test y por dispositivo
    name, browser_type, device = device_def
    base = tmp_path_factory.mktemp("artifacts")
    test_id = sanitize(request.node.name)
    dev_id = sanitize(name)
    folder = base / f"{test_id}__{dev_id}"
    folder.mkdir(parents=True, exist_ok=True)
    return folder

@pytest.fixture(scope="function")
def page(request, device_def, base_url, browser_context_tmpdir):
    name, browser_type, device = device_def
    # Lanzar navegador
    browser: Browser = browser_type.launch(headless=True)
    # Video por test
    context_args = dict(record_video_dir=str(browser_context_tmpdir / "video"))
    if device:
        context_args.update(device)
    context: BrowserContext = browser.new_context(**context_args)
    # Iniciar tracing
    context.tracing.start(screenshots=True, snapshots=True, sources=True)
    page: Page = context.new_page()
    page.set_default_timeout(15000)
    page.set_default_navigation_timeout(20000)

    # Cerrar y guardar trazas al final
    yield page

    trace_path = browser_context_tmpdir / "trace.zip"
    context.tracing.stop(path=str(trace_path))
    context.close()
    browser.close()

@pytest.fixture
def snap(page, request, browser_context_tmpdir):
    """Guarda captura y la adjunta al reporte HTML (pytest-html)."""
    from pytest_html import extras
    def _snap(name: str):
        p = (browser_context_tmpdir / f"{sanitize(name)}.png")
        page.screenshot(path=str(p), full_page=True)
        if hasattr(request.node, 'extra'):
            request.node.extra.append(extras.png(p.read_bytes(), name=name))
        return p
    return _snap

# Hook de pytest-html: asegura lista de extras por test
def pytest_runtest_setup(item):
    if not hasattr(item, "extra"):
        item.extra = []

def pytest_html_results_table_row(report, cells):
    # opcional: podrías personalizar filas
    pass

def pytest_html_results_table_html(report, data):
    # Adjunta extras (capturas) en el reporte
    if hasattr(report, "extra"):
        for extra in report.extra:
            data.append(extra)
