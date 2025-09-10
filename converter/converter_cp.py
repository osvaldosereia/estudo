import json
import re

# Caminhos de entrada e saída
arquivo_entrada = "cp.txt"               # seu Código Penal em texto
arquivo_saida = "codigo_penal.json"      # JSON hierárquico

# Função auxiliar para limpar textos
def limpar_texto(txt):
    return re.sub(r"\s+", " ", txt.strip())

# Estrutura inicial do JSON
codigo_penal = {
    "id": "codigo_penal",
    "nome": "Código Penal",
    "tipo": "codigo",
    "partes": []
}

parte_atual = None
titulo_atual = None
capitulo_atual = None

with open(arquivo_entrada, "r", encoding="utf-8", errors="ignore") as f:
    for linha in f:
        l = linha.strip()

        # Detecta Partes
        if re.match(r"^PARTE\s+[A-Z]", l, re.IGNORECASE):
            parte_atual = {"id": f"parte_{len(codigo_penal['partes'])+1}",
                           "titulo": limpar_texto(l),
                           "titulos": []}
            codigo_penal["partes"].append(parte_atual)

        # Detecta Títulos
        elif re.match(r"^TÍTULO\s+[IVXLCDM]+", l, re.IGNORECASE):
            titulo_atual = {"id": f"titulo_{len(parte_atual['titulos'])+1}",
                            "nome": limpar_texto(l),
                            "capitulos": []}
            parte_atual["titulos"].append(titulo_atual)

        # Detecta Capítulos
        elif re.match(r"^CAPÍTULO\s+[IVXLCDM]+", l, re.IGNORECASE):
            capitulo_atual = {"id": f"capitulo_{len(titulo_atual['capitulos'])+1}",
                              "nome": limpar_texto(l),
                              "artigos": []}
            titulo_atual["capitulos"].append(capitulo_atual)

        # Detecta Artigos
        elif re.match(r"^Art\.\s*\d+", l):
            numero = re.findall(r"^Art\.\s*\d+[º°]?", l)[0]
            artigo = {"id": f"cp_{numero.replace(' ', '').replace('.', '').replace('º','')}",
                      "artigo": numero,
                      "texto": limpar_texto(l)}
            if capitulo_atual:
                capitulo_atual["artigos"].append(artigo)
            elif titulo_atual:
                # caso raro: artigo fora de capítulo
                if "artigos" not in titulo_atual:
                    titulo_atual["artigos"] = []
                titulo_atual["artigos"].append(artigo)

        # Continua texto do artigo
        elif capitulo_atual and capitulo_atual["artigos"]:
            capitulo_atual["artigos"][-1]["texto"] += " " + limpar_texto(l)
        elif titulo_atual and "artigos" in titulo_atual and titulo_atual["artigos"]:
            titulo_atual["artigos"][-1]["texto"] += " " + limpar_texto(l)

# Salva como JSON
with open(arquivo_saida, "w", encoding="utf-8") as out:
    json.dump(codigo_penal, out, ensure_ascii=False, indent=2)

print(f"Arquivo JSON gerado em: {arquivo_saida}")
