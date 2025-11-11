import os
import time
import pytest
from playwright.sync_api import expect

APPS = [
    { "path": "/comedor",    "pregunta": "servicio de comedor",    "pos": ["Excelente","Bueno"], "neg": ["Regular","Malo"] },
    { "path": "/transporte", "pregunta": "servicio de transporte", "pos": ["Excelente","Bueno"], "neg": ["Regular","Malo"] },
]

def _empleado_input(page):
    cands = [
        page.get_by_label("empleado", exact=False),
        page.get_by_placeholder("empleado", exact=False),
        page.locator("input[name=empleado]"),
        page.locator("input[id*='empleado' i]"),
        page.locator("input[type=tel]"),
        page.locator("input[type=number]")
    ]
    for c in cands:
        try:
            if c.first.is_visible():
                return c.first
        except Exception:
            pass
    return cands[0].first

def _comentario_input(page):
    cands = [
        page.get_by_label("comentario", exact=False),
        page.get_by_placeholder("comentario", exact=False),
        page.locator("textarea[name=comentario]"),
        page.locator("textarea[id*='comentario' i]"),
        page.locator("textarea"),
    ]
    for c in cands:
        try:
            if c.first.is_visible():
                return c.first
        except Exception:
            pass
    return cands[0].first

@pytest.mark.kiosco
@pytest.mark.parametrize("app", APPS, ids=["comedor","transporte"])
def test_pantalla_principal(page, base_url, app, snap):
    page.goto(base_url + app["path"])  # visita
    snap("01-visit")
    expect(page.get_by_text(app["pregunta"], exact=False)).to_be_visible()
    for b in ["Excelente","Bueno","Regular","Malo"]:
        expect(page.get_by_role("button", name=b)).to_be_visible()
    snap("02-main-buttons")

@pytest.mark.kiosco
@pytest.mark.parametrize("app", APPS, ids=["comedor","transporte"])
def test_flujo_positivo(page, base_url, app, snap):
    page.goto(base_url + app["path"])  # main
    snap("01-main")
    page.get_by_role("button", name=app["pos"][0]).click()
    snap("02-motivos")

    # Clic a un motivo distinto de "Otro"
    secundarios = page.locator('button.boton-grande')
    n = secundarios.count()
    clicked = False
    for i in range(n):
        el = secundarios.nth(i)
        txt = el.inner_text().strip()
        if not txt.lower().startswith('otro'):
            el.click()
            clicked = True
            break
    if not clicked:
        page.get_by_role("button", name="Otro").click()
    snap("03-gracias")
    expect(page.get_by_text("Gracias", exact=False)).to_be_visible()

@pytest.mark.kiosco
@pytest.mark.parametrize("app", APPS, ids=["comedor","transporte"])
def test_flujo_otro_enter_enter(page, base_url, app, snap):
    page.goto(base_url + app["path"])  # main
    snap("01-main")

    # Calificación negativa
    page.get_by_role("button", name=app["neg"][0]).click()
    snap("02-secundarios")

    page.get_by_role("button", name="Otro").click()
    snap("03-otro-modal")

    empleado = _empleado_input(page)
    empleado.fill("12345"); snap("04-otro-empleado"); empleado.press("Enter")

    comentario = _comentario_input(page)
    expect(comentario).to_be_focused()
    comentario.fill("Comentario E2E Py: flujo Otro")
    snap("05-otro-comentario"); comentario.press("Enter")

    expect(page.get_by_text("Gracias", exact=False)).to_be_visible()
    snap("06-gracias")
    # Debe volver al home en ≤4s
    page.wait_for_timeout(2000)
    expect(page.get_by_role("button", name="Excelente")).to_be_visible()
    snap("07-home-reset")

@pytest.mark.kiosco
@pytest.mark.parametrize("app", APPS, ids=["comedor","transporte"])
def test_cola_offline_reconexion(page, base_url, app, snap):
    page.goto(base_url + app["path"])  # main
    snap("01-main")

    # Offline
    page.context.set_offline(True)
    page.get_by_role("button", name="Excelente").click()
    snap("02-secundarios-off")
    page.locator('button.boton-grande').first.click()
    snap("03-gracias-off")
    expect(page.get_by_text("Gracias", exact=False)).to_be_visible()

    # Online
    page.context.set_offline(False)
    page.evaluate("window.dispatchEvent(new Event('online'))")
    snap("04-reonline")

    # Home de nuevo
    expect(page.get_by_role("button", name="Excelente")).to_be_visible()
    snap("05-home")
