import requests
from bs4 import BeautifulSoup

URL = "https://www.planalto.gov.br/ccivil_03/decreto-lei/del2848compilado.htm"  # Código Penal

print("Baixando HTML do Planalto...")
html = requests.get(URL).text
soup = BeautifulSoup(html, "lxml")

print("Extraindo artigos...")
for tag in soup.find_all(["p", "div"]):
    txt = tag.get_text().strip()
    if txt.startswith("Art."):
        print(txt[:120])  # mostra só os primeiros 120 caracteres
