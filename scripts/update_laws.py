import requests
from bs4 import BeautifulSoup
import json

URLS = {
    "codigo_penal": "https://www.planalto.gov.br/ccivil_03/decreto-lei/del2848compilado.htm",
    "codigo_civil": "https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilado.htm",
    "cpc": "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105.htm",
    "cpp": "https://www.planalto.gov.br/ccivil_03/decreto-lei/del3689compilado.htm"
}

def baixar_codigo(nome, url):
    print(f"Baixando {nome}...")
    html = requests.get(url).text
    soup = BeautifulSoup(html, "lxml")

    artigos = []
    for tag in soup.find_all(["p", "div"]):
        txt = tag.get_text().strip()
        if txt.startswith("Art."):
            artigos.append(txt)

    with open(f"data/{nome}.json", "w", encoding="utf-8") as f:
        json.dump(artigos, f, ensure_ascii=False, indent=2)
    print(f"✅ {nome} salvo em data/{nome}.json ({len(artigos)} artigos)")

for nome, url in URLS.items():
    baixar_codigo(nome, url)
