/**
 * =================================================================
 * MÓDULO: app.js
 * DESCRIÇÃO: Lógica principal de gerenciamento de rotas e entregas
 * =================================================================
 */

// --- Constantes Globais ---
// Mensagem padrão para o WhatsApp
const MENSAGEM_WHATSAPP = "Aqui é o entregador da Cesta Básica, chego ai em alguns minutos. Por favor me de um ok. Obrigado.";
// Limite de rotas salvas
const MAX_ROTAS = 30;

// --- Estado da Aplicação ---
let todasAsRotas = {};
let rotaAtivaId = null;
let CLIENTES_CACHE = {}; // Cache para busca rápida de clientes por nome
let entregaParaPagarId = null; // ID da entrega no modal de pagamento

// --- Seletores de Elementos ---
const btnNovaRota = document.getElementById('btn-nova-rota');
const selectRotaAtiva = document.getElementById('select-rota-ativa');
const inputNomeRota = document.getElementById('input-nome-rota');
const inputDataRota = document.getElementById('input-data-rota');
const displayDiaSemana = document.getElementById('display-dia-semana');
const btnExcluirRota = document.getElementById('btn-excluir-rota');

// Seletores de Despesas
const inputDespesaAbastecimento = document.getElementById('input-despesa-abastecimento');
const inputDespesaAlimentacao = document.getElementById('input-despesa-alimentacao');
const inputDespesaExtra = document.getElementById('input-despesa-extra');

const formEntrega = document.getElementById('form-entrega');
const inputCliente = document.getElementById('input-cliente');
const datalistClientes = document.getElementById('lista-clientes');
const infoClienteSelecionado = document.getElementById('info-cliente-selecionado');
const displayClienteEndereco = document.getElementById('display-cliente-endereco');
const displayClienteComplemento = document.getElementById('display-cliente-complemento');
const displayClienteCelular = document.getElementById('display-cliente-celular');
const obsClienteInput = document.getElementById('obs-cliente');
const selectCesta = document.getElementById('select-cesta');
const inputValorCesta = document.getElementById('input-valor-cesta');
const campoAlterada = document.getElementById('campo-alterada');
const codigoAlteradaInput = document.getElementById('codigo-alterada');
const listaEntregasEl = document.getElementById('lista-entregas');
const listaVaziaEl = document.getElementById('lista-vazia');

// Modais
const modalPagamento = document.getElementById('modal-pagamento');
const formPagamento = document.getElementById('form-pagamento');
const btnCancelarPagamento = document.getElementById('btn-cancelar-pagamento');
const modalClienteNome = document.getElementById('modal-cliente-nome');
const modalClienteValor = document.getElementById('modal-cliente-valor');
const modalErrorPagamento = document.getElementById('modal-error-pagamento');
const btnExportar = document.getElementById('btn-exportar');
const btnCarregar = document.getElementById('btn-carregar');
const modalExportar = document.getElementById('modal-exportar');
const exportRelatorioEl = document.getElementById('export-relatorio');
const exportWhatsappLinkEl = document.getElementById('export-whatsapp-link');
const btnFecharExportar = document.getElementById('btn-fechar-exportar');
const modalAviso = document.getElementById('modal-aviso');
const modalAvisoTexto = document.getElementById('modal-aviso-texto');
const btnFecharAviso = document.getElementById('btn-fechar-aviso');
const inputCarregarArquivo = document.getElementById('input-carregar-arquivo');

// --- Funções de Utilitários ---

/**
 * Exibe o modal de aviso com uma mensagem
 * @param {string} mensagem - A mensagem a ser exibida.
 */
function mostrarAviso(mensagem) {
    modalAvisoTexto.textContent = mensagem;
    modalAviso.classList.remove('hidden');
}

/**
 * Fecha o modal de aviso
 */
function fecharAviso() {
    modalAviso.classList.add('hidden');
}

/**
 * Formata um valor numérico para o formato de moeda BRL (R$ 123,45)
 * @param {number|string} valor - O valor a ser formatado.
 * @returns {string} O valor formatado como moeda.
 */
function formatarMoeda(valor) {
    // Garante que o valor é um número
    const num = parseFloat(valor);
    if (isNaN(num)) return 'R$ 0,00';
    return num.toLocaleString('pt-br', { style: 'currency', currency: 'BRL' });
}

/**
 * Formata um ISO Date String (ou Date obj) para um formato legível (dd/mm/aaaa hh:mm)
 * @param {string} isoString - A string de data ISO.
 * @returns {string} A data e hora formatada.
 */
function formatarData(isoString) {
    if (!isoString) return '';
    const data = new Date(isoString);
    // Verifica se a data é válida
    if (isNaN(data)) return '';
    return data.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Pega o dia da semana de uma data (yyyy-mm-dd)
 * @param {string} dataString - A string de data (ex: '2025-11-09').
 * @returns {string} O dia da semana por extenso.
 */
function getDiaDaSemana(dataString) {
    if (!dataString) return '-';
    // Adiciona T12:00:00 para evitar problemas de fuso horário com new Date()
    const data = new Date(dataString + 'T12:00:00');
    // Verifica se a data é válida
    if (isNaN(data)) return '-';
    const dia = data.toLocaleDateString('pt-BR', { weekday: 'long' });
    // Capitaliza a primeira letra
    return dia.charAt(0).toUpperCase() + dia.slice(1);
}

/**
 * Atualiza o input de valor quando a cesta é selecionada
 */
function atualizarValorCesta() {
    const selectedOption = selectCesta.options[selectCesta.selectedIndex];
    // Usa '165.00' como fallback seguro se o data-valor não existir
    const valor = selectedOption ? selectedOption.dataset.valor || "165.00" : "165.00"; 
    inputValorCesta.value = parseFloat(valor).toFixed(2);
}

/**
 * Mostra/oculta o campo de "cesta alterada" e gerencia a obrigatoriedade
 */
function toggleCampoAlterada() {
    const tipo = document.querySelector('input[name="tipo-cesta"]:checked').value;
    if (tipo === 'Alterada') {
        campoAlterada.classList.remove('hidden');
        codigoAlteradaInput.required = true;
    } else {
        campoAlterada.classList.add('hidden');
        codigoAlteradaInput.required = false;
        codigoAlteradaInput.value = '';
        // Reseta checkboxes
        document.querySelectorAll('input[name="partes_alteradas"]:checked').forEach(cb => {
            cb.checked = false;
        });
    }
}

// --- Funções de Persistência (LocalStorage) ---

/**
 * Salva o objeto 'todasAsRotas' no LocalStorage.
 * Aplica gerenciamento de limite (MAX_ROTAS)
 */
function salvarTodasAsRotas() {
    const chavesRotas = Object.keys(todasAsRotas);
    if (chavesRotas.length > MAX_ROTAS) {
        // Encontra as rotas mais antigas (baseado no ID, que é um timestamp)
        // O ID é uma string, mas o sort funciona numericamente se a função for dada
        const chavesOrdenadas = chavesRotas.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
        const chavesParaRemover = chavesOrdenadas.slice(0, chavesOrdenadas.length - MAX_ROTAS);
        
        chavesParaRemover.forEach(chave => {
            delete todasAsRotas[chave];
        });
    }
    
    try {
        localStorage.setItem('gerenciadorDeRotas', JSON.stringify(todasAsRotas));
        // Salva o ID da rota ativa
        if (rotaAtivaId) {
            localStorage.setItem('rotaAtivaId', rotaAtivaId);
        }
    } catch (e) {
        console.error("Erro ao salvar no LocalStorage:", e);
        mostrarAviso("Erro ao salvar dados. Seu navegador pode estar sem espaço ou configurado para bloquear o LocalStorage.");
    }
}

/**
 * Função de wrapper para salvar a rota ativa.
 */
function salvarLocalStorage() {
    salvarTodasAsRotas();
}

/**
 * NOVO: Salva os valores de despesa na rota ativa
 */
function salvarDespesas() {
    const rota = todasAsRotas[rotaAtivaId];
    if (!rota) return;

    rota.despesas = {
        // Garante que o valor é um número (fallback para 0 se NaN)
        abastecimento: parseFloat(inputDespesaAbastecimento.value) || 0,
        alimentacao: parseFloat(inputDespesaAlimentacao.value) || 0,
        extra: parseFloat(inputDespesaExtra.value) || 0
    };

    salvarTodasAsRotas();
}


// --- Funções de Gerenciamento de Rota ---

/**
 * Carrega todas as rotas do LocalStorage e inicia o app.
 */
function iniciarAplicativo() {
    // 1. Carregar Clientes (do clientes.js)
    try {
        // CLIENTES_DB é carregado via <script src="clientes.js">
        if (typeof CLIENTES_DB !== 'undefined' && Array.isArray(CLIENTES_DB)) {
            datalistClientes.innerHTML = '';
            CLIENTES_DB.forEach(cliente => {
                const option = document.createElement('option');
                option.value = cliente.nome;
                datalistClientes.appendChild(option);
                // Cria um cache para busca rápida (Nome minúsculo como chave)
                CLIENTES_CACHE[cliente.nome.toLowerCase()] = cliente;
            });
        } else {
            console.warn("CLIENTES_DB não encontrado. O recurso de autocompletar cliente não funcionará.");
            datalistClientes.innerHTML = '<option value="Aviso: clientes.js não carregado."></option>';
        }
    } catch (e) {
         console.error("Erro ao processar clientes:", e);
         datalistClientes.innerHTML = '<option value="Erro ao carregar clientes."></option>';
    }

    // 2. Carregar Rotas
    const dadosSalvos = localStorage.getItem('gerenciadorDeRotas');
    if (dadosSalvos) {
        try {
            todasAsRotas = JSON.parse(dadosSalvos);
        } catch (e) {
            console.error("Erro ao parsear rotas salvas. Resetando dados.", e);
            todasAsRotas = {};
        }
    }

    // 3. Descobrir qual rota está ativa
    rotaAtivaId = localStorage.getItem('rotaAtivaId');

    // 4. Se não houver rotas, ou a rota ativa não existir, cria uma nova
    const chavesRotas = Object.keys(todasAsRotas);
    if (!rotaAtivaId || !todasAsRotas[rotaAtivaId]) {
        if (chavesRotas.length === 0) {
            criarNovaRota(false);
        } else {
            // Pega a rota mais recente (assumindo que o ID é um timestamp)
            const chavesOrdenadas = chavesRotas.sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
            rotaAtivaId = chavesOrdenadas[0];
            localStorage.setItem('rotaAtivaId', rotaAtivaId);
        }
    }

    // 5. Popular o <select> e carregar a rota ativa na tela
    popularSelectRotas();
    carregarRotaAtiva();
}

/**
 * Pega o array de entregas da rota ativa.
 * @returns {Array} O array de entregas.
 */
function getEntregasAtivas() {
    if (rotaAtivaId && todasAsRotas[rotaAtivaId]) {
        return todasAsRotas[rotaAtivaId].entregas;
    }
    return [];
}

/**
 * Atualiza o <select> com as rotas salvas
 */
function popularSelectRotas() {
    selectRotaAtiva.innerHTML = '';
    
    // Ordena as rotas (a mais nova primeiro)
    const chavesOrdenadas = Object.keys(todasAsRotas).sort((a, b) => parseInt(b, 10) - parseInt(a, 10));

    if (chavesOrdenadas.length === 0) {
        // Se não houver rotas, desabilita o seletor
        selectRotaAtiva.disabled = true;
        selectRotaAtiva.innerHTML = '<option>Nenhuma rota salva</option>';
        return;
    }

    selectRotaAtiva.disabled = false;
    chavesOrdenadas.forEach(id => {
        const rota = todasAsRotas[id];
        const option = document.createElement('option');
        option.value = id;
        const dataFormatada = rota.data ? new Date(rota.data + 'T12:00:00').toLocaleDateString('pt-BR') : 'Sem Data';
        option.textContent = `${rota.nome} (${dataFormatada})`;
        
        if (id === rotaAtivaId) {
            option.selected = true;
        }
        selectRotaAtiva.appendChild(option);
    });
}

/**
 * Carrega os dados da rota ativa na tela (inputs e lista de entregas)
 */
function carregarRotaAtiva() {
    const rota = todasAsRotas[rotaAtivaId];
    if (!rota) {
        // Se a rota sumiu (ex: excluída), recria a interface
        iniciarAplicativo(); 
        return;
    }

    // Atualiza os inputs de gerenciamento
    inputNomeRota.value = rota.nome;
    inputDataRota.value = rota.data;
    displayDiaSemana.textContent = getDiaDaSemana(rota.data);

    // Atualiza os inputs de despesa (Garante fallback para 0)
    rota.despesas = rota.despesas || { abastecimento: 0, alimentacao: 0, extra: 0 };
    inputDespesaAbastecimento.value = (rota.despesas.abastecimento || 0).toFixed(2);
    inputDespesaAlimentacao.value = (rota.despesas.alimentacao || 0).toFixed(2);
    inputDespesaExtra.value = (rota.despesas.extra || 0).toFixed(2);

    // Atualiza o <select>
    selectRotaAtiva.value = rotaAtivaId;
    
    // Renderiza as entregas dessa rota
    renderizarEntregas();
}

/**
 * Limpa a tela e cria uma nova rota
 * @param {boolean} atualizarTela - Se deve atualizar o DOM após a criação.
 */
function criarNovaRota(atualizarTela = true) {
    // Para evitar conflito, verificamos se o timestamp já existe como chave
    let novoId = Date.now().toString(); 
    while(todasAsRotas[novoId]) {
        novoId = (parseInt(novoId, 10) + 1).toString();
    }
    
    const hoje = new Date().toISOString().split('T')[0];

    const novaRota = {
        id: novoId,
        nome: `Rota ${Object.keys(todasAsRotas).length + 1}`,
        data: hoje,
        entregas: [],
        despesas: { abastecimento: 0, alimentacao: 0, extra: 0 }
    };

    todasAsRotas[novoId] = novaRota;
    rotaAtivaId = novoId;

    salvarTodasAsRotas();
    
    if (atualizarTela) {
        popularSelectRotas();
        carregarRotaAtiva();
        mostrarAviso(`Nova Rota '${novaRota.nome}' criada e definida como ativa.`);
    }
}

/**
 * Atualiza Nome e Data da rota ativa
 */
function atualizarInfoRota() {
    const rota = todasAsRotas[rotaAtivaId];
    if (!rota) return;
    
    // Garante que a data e o nome não fiquem vazios
    rota.nome = inputNomeRota.value.trim() || "Rota Sem Nome";
    rota.data = inputDataRota.value || new Date().toISOString().split('T')[0];
    
    displayDiaSemana.textContent = getDiaDaSemana(rota.data);

    salvarTodasAsRotas();
    popularSelectRotas(); // Atualiza o texto no select
}

/**
 * Exclui a rota ativa (com confirmação implícita - idealmente ter um modal de confirmação)
 */
function excluirRotaAtiva() {
    if (Object.keys(todasAsRotas).length <= 1) {
        mostrarAviso("Você não pode excluir a última rota. Crie uma nova antes de excluir esta.");
        return;
    }

    if (!confirm(`Tem certeza que deseja excluir a rota "${todasAsRotas[rotaAtivaId].nome}"? Esta ação é irreversível.`)) {
        return;
    }
    
    delete todasAsRotas[rotaAtivaId];
    
    // Pega a próxima rota (a mais recente)
    const chavesOrdenadas = Object.keys(todasAsRotas).sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
    rotaAtivaId = chavesOrdenadas[0];
    
    salvarTodasAsRotas();
    
    popularSelectRotas();
    carregarRotaAtiva();
    mostrarAviso("Rota excluída com sucesso. Carregada a rota mais recente.");
}

// --- Funções de Renderização e Interação da Lista ---

/**
 * Renderiza todos os cards de entrega (DA ROTA ATIVA) na tela
 */
function renderizarEntregas() {
    listaEntregasEl.innerHTML = '';
    const entregas = getEntregasAtivas();

    if (entregas.length === 0) {
        listaVaziaEl.classList.remove('hidden');
        return;
    }
    
    listaVaziaEl.classList.add('hidden');

    entregas.forEach((entrega, index) => {
        const card = document.createElement('div');
        card.dataset.id = entrega.id;
        const isFinalizada = entrega.status === 'Entregue' || entrega.status === 'Cancelada';
        
        card.className = `p-4 bg-white rounded-lg shadow-sm border flex flex-col sm:flex-row items-start sm:items-center justify-between transition-all ${entrega.status === 'Entregue' ? 'entregue' : (entrega.status === 'Cancelada' ? 'cancelada' : '')}`;
        
        let infoTags = [];

        // Tags de Cesta
        if (entrega.tipo === 'Normal') {
            infoTags.push(`<span class="text-xs font-semibold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">Normal</span>`);
        } else {
            // Tags amarelas para Alterada
            infoTags.push(`<span class="text-xs font-semibold bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">Alterada</span>`);
            if (entrega.codigoAlterada) {
                infoTags.push(`<span class="text-xs font-semibold bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full" title="${entrega.codigoAlterada}">${entrega.codigoAlterada.substring(0, 20)}...</span>`);
            }
            if (entrega.partesAlteradas && entrega.partesAlteradas.length > 0) {
                 infoTags.push(`<span class="text-xs font-semibold bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">${entrega.partesAlteradas.join(', ')}</span>`);
            }
        }

        // Tag de Brinde
        if (entrega.brinde === 'Sim') {
            infoTags.push(`<span class="text-xs font-semibold bg-pink-100 text-pink-800 px-2 py-0.5 rounded-full">Brinde</span>`);
        }

        let statusInfo = '';
        if (entrega.status === 'Entregue') {
            statusInfo = `
                <div class="text-xs text-green-700 mt-1 sm:ml-4">
                    <span class="font-semibold">Pagamento:</span> ${entrega.formaPagamento.join(', ')}<br>
                    <span class="font-semibold">Horário:</span> ${formatarData(entrega.horarioEntrega)}
                </div>
            `;
        } else if (entrega.status === 'Cancelada') {
            statusInfo = `
                <div class="text-xs text-red-700 mt-1 sm:ml-4">
                    <span class="font-semibold">Status:</span> CANCELADA<br>
                    <span class="font-semibold">Horário:</span> ${formatarData(entrega.horarioEntrega)}
                </div>
            `;
        }

        // Info da Observação do Cliente
        let obsInfo = '';
        if (entrega.observacao) {
            obsInfo = `<p class="text-sm text-red-600 font-medium truncate" title="${entrega.observacao}">OBS: ${entrega.observacao}</p>`;
        }

        // Info do Cliente (Nome, Endereço, Complemento)
        let infoClienteHtml = `
            <p class="text-base font-semibold text-gray-800 truncate" title="${entrega.cliente.nome}">${entrega.cliente.nome}</p>
            ${obsInfo}
            <p class="text-sm text-gray-600 truncate" title="${entrega.cliente.endereco || ''}">${entrega.cliente.endereco || 'Sem endereço'}</p>
            <p class="text-sm text-gray-500 truncate" title="${entrega.cliente.complemento || ''}">${entrega.cliente.complemento || 'Sem complemento'}</p>
            <p class="text-sm font-medium text-blue-600">${entrega.cliente.celular || 'Sem celular'}</p>
            <p class="text-sm text-gray-500 mt-1">${entrega.cesta.nome} - <span class="font-medium">${formatarMoeda(entrega.cesta.valor)}</span></p>
        `;
        
        // Lógica para desabilitar botões de mover
        const isPrimeiro = index === 0;
        const isUltimo = index === entregas.length - 1;

        // Prepara link do WhatsApp
        let whatsappHref = '#';
        let whatsappDisabled = true;
        let whatsappClass = 'bg-white text-gray-400 border border-gray-300 cursor-not-allowed';
        if (entrega.cliente.celular && !isFinalizada) {
            const numeroLimpo = entrega.cliente.celular.replace(/\D/g, '');
            const numeroFinal = numeroLimpo.startsWith('55') ? numeroLimpo : `55${numeroLimpo}`;
            
            if(numeroFinal.length >= 10) { 
                whatsappHref = `https://api.whatsapp.com/send?phone=${numeroFinal}&text=${encodeURIComponent(MENSAGEM_WHATSAPP)}`;
                whatsappDisabled = false;
                whatsappClass = 'bg-green-100 text-green-700 border border-green-300 hover:bg-green-200';
            }
        }


        card.innerHTML = `
            <div class="flex-1 min-w-0">
                <div class="flex items-start">
                    <div class="flex flex-col items-center justify-center mr-3 pt-1">
                        <button class="btn-mover-cima text-gray-400 ${isPrimeiro || isFinalizada ? 'opacity-25 cursor-not-allowed' : 'hover:text-blue-600'}" data-id="${entrega.id}" title="Mover para Cima" ${isPrimeiro || isFinalizada ? 'disabled' : ''}>
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7" />
                            </svg>
                        </button>
                        <button class="btn-mover-baixo text-gray-400 ${isUltimo || isFinalizada ? 'opacity-25 cursor-not-allowed' : 'hover:text-blue-600'}" data-id="${entrega.id}" title="Mover para Baixo" ${isUltimo || isFinalizada ? 'disabled' : ''}>
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                    </div>
                    <div class="truncate">
                        ${infoClienteHtml}
                    </div>
                </div>
                <div class="mt-2 sm:ml-12 flex flex-wrap gap-2 items-center">
                    ${infoTags.join(' ')}
                    ${statusInfo}
                </div>
            </div>
            <div class="mt-4 sm:mt-0 sm:ml-4 flex-shrink-0 flex flex-col sm:flex-row gap-2">
                <a href="${whatsappHref}" target="_blank" class="btn-card-whatsapp w-full sm:w-auto rounded-md px-4 py-3 text-sm font-medium shadow-sm ${whatsappClass}" title="Enviar WhatsApp" ${whatsappDisabled ? 'disabled' : ''}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" class="h-5 w-5 inline-block"><path d="M12.031 2.316A10.009 10.009 0 0 0 2.083 12.26c0 1.956.495 3.864 1.43 5.518L2 22l4.492-1.472A9.914 9.914 0 0 0 12.031 22h.005a10.009 10.009 0 0 0 9.957-9.74A10.009 10.009 0 0 0 12.031 2.316zM17.07 15.696c-.19.34-.35.34-.644.512-.294.172-.63.268-1.28.256-1.127-.024-2.812-.55-4.137-1.875s-2.074-3.04-2.098-4.168c-.012-.65.084-.986.256-1.28.172-.294.332-.454.512-.644.34-.34.78-.813 1.05-.737.27.076.438.2.628.627.19.427.63.172.82.024.19-.148.166-.272.19-.444.024-.172.19-.344.24-.512.05-.168.048-.34.024-.512-.024-.172-.096-.32-.192-.488-.096-.168-.22-.408-.344-.512-.124-.104-.268-.168-.444-.192-.176-.024-.34-.024-.512-.024-.528.024-1.056.12-1.554.268-.498.148-.96.344-1.396.644-1.218.84-2.285 2.01-2.99 3.282-.705 1.272-1.074 2.658-1.074 4.072 0 .54.048.972.144 1.344.096.372.24.716.444 1.032.204.316.444.596.72.84.276.244.6.43.956.548.356.118.756.142 1.188.142 1.056-.024 1.84-.42 2.508-1.008.668-.588 1.08-1.38 1.08-2.296.0-.512-.072-.94-.192-1.308-.12-.368-.312-.614-.588-.738z"/></svg>
                </a>
                <button class="btn-card-maps w-full sm:w-auto rounded-md px-4 py-3 text-sm font-medium shadow-sm bg-white text-gray-700 border border-gray-300 ${isFinalizada ? 'cursor-not-allowed opacity-50' : 'hover:bg-gray-50'}" title="Abrir no Google Maps" ${isFinalizada ? 'disabled' : ''}>
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 inline-block" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd" /></svg>
                    <span class="sm:hidden ml-2">Abrir Mapa</span>
                </button>
                
                ${entrega.status === 'Pendente' ? `
                    <button class="btn-cancelar-entrega w-full sm:w-auto rounded-md px-4 py-3 text-sm font-medium shadow-sm bg-red-100 text-red-700 border border-red-300 hover:bg-red-200" data-id="${entrega.id}">
                        Cancelar
                    </button>
                    <button class="btn-entregue w-full sm:w-auto rounded-md px-4 py-3 text-sm font-medium shadow-sm bg-white text-gray-700 border border-gray-300 hover:bg-gray-50" data-id="${entrega.id}">
                        Marcar Entrega
                    </button>
                ` : (entrega.status === 'Entregue' ? `
                    <button class="btn-entregue w-full sm:w-auto rounded-md px-4 py-3 text-sm font-medium shadow-sm bg-green-600 text-white cursor-not-allowed" disabled>
                        Entregue
                    </button>
                ` : `
                    <button class="btn-entregue w-full sm:w-auto rounded-md px-4 py-3 text-sm font-medium shadow-sm bg-gray-500 text-white cursor-not-allowed" disabled>
                        Cancelada
                    </button>
                `)}
            </div>
        `;
        listaEntregasEl.appendChild(card);
    });
}

/**
 * Lida com o submit do formulário de nova entrega
 * @param {Event} e - O evento de submit.
 */
function adicionarEntrega(e) {
    e.preventDefault();
    
    const rotaAtiva = todasAsRotas[rotaAtivaId];
    if (!rotaAtiva) {
        mostrarAviso("Nenhuma rota ativa selecionada. Crie uma nova rota.");
        return;
    }
    const entregas = rotaAtiva.entregas;

    const selectedOption = selectCesta.options[selectCesta.selectedIndex];
    
    // Busca o cliente selecionado no Cache
    const nomeClienteSelecionado = inputCliente.value.trim();
    const clienteSelecionado = CLIENTES_CACHE[nomeClienteSelecionado.toLowerCase()];

    let clienteData;
    if (clienteSelecionado) {
        // Cliente encontrado no DB
        clienteData = { ...clienteSelecionado }; // Clonar para não alterar o cache
    } else {
        // Cliente avulso (digitado)
        clienteData = {
            nome: nomeClienteSelecionado,
            celular: '',
            endereco: nomeClienteSelecionado,
            complemento: ''
        };
    }

    if (!clienteData.nome) {
        mostrarAviso('Por favor, selecione ou digite um nome de cliente.');
        return;
    }
    
    // Coleta Partes Alteradas
    const partesAlteradasSelecionadas = 
        Array.from(formEntrega.querySelectorAll('input[name="partes_alteradas"]:checked'))
             .map(input => input.value);
    // Coleta Brinde
    const brindeSelecionado = document.querySelector('input[name="brinde"]:checked').value;
    
    const novaEntrega = {
        id: Date.now(), // ID único
        cliente: clienteData,
        observacao: obsClienteInput.value.trim(),
        cesta: {
            nome: selectedOption.value,
            valor: parseFloat(inputValorCesta.value)
        },
        tipo: document.querySelector('input[name="tipo-cesta"]:checked').value,
        codigoAlterada: codigoAlteradaInput.value.trim(),
        partesAlteradas: partesAlteradasSelecionadas,
        brinde: brindeSelecionado,
        status: "Pendente",
        formaPagamento: [],
        horarioEntrega: null
    };

    entregas.push(novaEntrega);
    salvarLocalStorage();
    renderizarEntregas();

    // Limpa o formulário
    formEntrega.reset();
    inputCliente.value = '';
    infoClienteSelecionado.classList.add('hidden');
    atualizarValorCesta();
    toggleCampoAlterada();
}

/**
 * Abre o Google Maps com o endereço do cliente.
 * BUG FIX: Corrigido o URL base.
 * @param {string} query - O endereço do cliente.
 */
function abrirGoogleMaps(query) {
    const enderecoFormatado = query.trim();
    if (!enderecoFormatado) {
        mostrarAviso('O cliente não possui um endereço cadastrado para abrir no mapa.');
        return;
    }
    // URL CORRETA para Google Maps com parâmetro de pesquisa 'q'
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(enderecoFormatado)}`;
    window.open(url, '_blank');
}

/**
 * Abre o modal de pagamento para a entrega clicada
 * @param {string} id - O ID da entrega.
 */
function abrirModalPagamento(id) {
    const entregas = getEntregasAtivas();
    const entrega = entregas.find(e => e.id.toString() === id);
    if (!entrega) return;

    entregaParaPagarId = id;
    
    // Preenche dados do modal
    modalClienteNome.textContent = entrega.cliente.nome;
    modalClienteValor.textContent = formatarMoeda(entrega.cesta.valor);
    
    // Reseta o formulário do modal
    formPagamento.reset();
    modalErrorPagamento.classList.add('hidden');

    // Exibe o modal
    modalPagamento.classList.remove('hidden');
}

/**
 * Fecha o modal de pagamento
 */
function fecharModalPagamento() {
    modalPagamento.classList.add('hidden');
    entregaParaPagarId = null;
}

/**
 * Marca uma entrega como Cancelada
 * @param {string} id - O ID da entrega.
 */
function cancelarEntrega(id) {
    if (!confirm("Tem certeza que deseja MARCAR ESTA ENTREGA COMO CANCELADA?")) return;

    const entregas = getEntregasAtivas();
    const index = entregas.findIndex(e => e.id.toString() === id);
    if (index !== -1) {
        entregas[index].status = "Cancelada";
        entregas[index].formaPagamento = [];
        entregas[index].horarioEntrega = new Date().toISOString();
    }
    salvarLocalStorage();
    renderizarEntregas();
}

/**
 * Move uma entrega para cima ou para baixo na lista
 * @param {string} id - O ID da entrega.
 * @param {('cima'|'baixo')} direcao - Direção do movimento.
 */
function moverEntrega(id, direcao) {
    const entregas = getEntregasAtivas();
    const index = entregas.findIndex(e => e.id.toString() === id);
    if (index === -1) return;

    // Se estiver finalizada, não move
    if (entregas[index].status !== 'Pendente') return;

    if (direcao === 'cima' && index > 0) {
        [entregas[index - 1], entregas[index]] = [entregas[index], entregas[index - 1]];
    } else if (direcao === 'baixo' && index < entregas.length - 1) {
        [entregas[index + 1], entregas[index]] = [entregas[index], entregas[index + 1]];
    } else {
        return;
    }

    salvarLocalStorage();
    renderizarEntregas();
}

/**
 * Lida com o clique nos cards (delegação de evento)
 * @param {Event} e - O evento de clique.
 */
function handleCardClick(e) {
    const btnCima = e.target.closest('.btn-mover-cima');
    if (btnCima && !btnCima.disabled) {
        moverEntrega(btnCima.dataset.id, 'cima');
        return;
    }

    const btnBaixo = e.target.closest('.btn-mover-baixo');
    if (btnBaixo && !btnBaixo.disabled) {
        moverEntrega(btnBaixo.dataset.id, 'baixo');
        return;
    }

    const btnCancelar = e.target.closest('.btn-cancelar-entrega');
    if (btnCancelar && !btnCancelar.disabled) {
        cancelarEntrega(btnCancelar.dataset.id);
        return;
    }

    const btnMaps = e.target.closest('.btn-card-maps');
    if (btnMaps && !btnMaps.disabled) {
        const cardId = btnMaps.closest('[data-id]').dataset.id;
        const entregas = getEntregasAtivas();
        const entrega = entregas.find(e => e.id.toString() === cardId);
        if (entrega) {
            abrirGoogleMaps(entrega.cliente.endereco);
        }
        return;
    }

    const target = e.target.closest('.btn-entregue');
    if (target && !target.disabled && target.textContent.trim() === 'Marcar Entrega') {
        abrirModalPagamento(target.dataset.id);
    }
}

/**
 * Lida com o submit do formulário de pagamento
 * @param {Event} e - O evento de submit.
 */
function salvarPagamento(e) {
    e.preventDefault();
    
    const formasPagamentoSelecionadas = 
        Array.from(formPagamento.querySelectorAll('input[name="forma_pagamento"]:checked'))
             .map(input => input.value);
    
    if (formasPagamentoSelecionadas.length === 0) {
        modalErrorPagamento.classList.remove('hidden');
        return;
    }
    
    // Encontra a entrega e atualiza
    const entregas = getEntregasAtivas();
    const index = entregas.findIndex(e => e.id.toString() === entregaParaPagarId);
    if (index !== -1) {
        entregas[index].status = "Entregue";
        entregas[index].formaPagamento = formasPagamentoSelecionadas;
        entregas[index].horarioEntrega = new Date().toISOString();
    }
    
    salvarLocalStorage();
    renderizarEntregas();
    fecharModalPagamento();
}

// --- Funções de Exportação/Importação ---

/**
 * Função para baixar dados como um arquivo JSON
 * @param {string} data - A string JSON.
 * @param {string} filename - O nome do arquivo.
 */
function downloadArquivo(data, filename) {
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Prepara e exibe o modal de exportação (Relatório e Backup)
 */
function exportarDados() {
    const rotaAtiva = todasAsRotas[rotaAtivaId];
    if (!rotaAtiva) {
        mostrarAviso("Nenhuma rota ativa para exportar.");
        return;
    }
    const entregas = rotaAtiva.entregas;

    // Garante que a ordem e as despesas estão salvas
    salvarLocalStorage();

    // 1. Prepara Relatório de Entregas Concluídas e Canceladas
    const entregasConcluidas = entregas.filter(e => e.status === 'Entregue');
    const entregasCanceladas = entregas.filter(e => e.status === 'Cancelada');
    
    let relatorioTexto = "";
    let whatsappTexto = `*Resumo da Rota: ${rotaAtiva.nome}* (${new Date(rotaAtiva.data + 'T12:00:00').toLocaleDateString('pt-BR')})\n\n`;

    if (entregasConcluidas.length === 0 && entregasCanceladas.length === 0) {
        relatorioTexto = "Nenhuma entrega finalizada.";
    }

    // Parte de Concluídas
    if (entregasConcluidas.length > 0) {
        relatorioTexto += "--- RELATÓRIO DE ENTREGAS ---\n\n";
        entregasConcluidas.forEach(e => {
            relatorioTexto += `Cliente: ${e.cliente.nome}\n`;
            relatorioTexto += `Valor: ${formatarMoeda(e.cesta.valor)}\n`;
            relatorioTexto += `Pagamento: ${e.formaPagamento.join(', ')}\n`;
            relatorioTexto += `Horário: ${formatarData(e.horarioEntrega)}\n`;
            relatorioTexto += `-----------------------------\n`;
        });
    }

    // Parte de Canceladas
    if (entregasCanceladas.length > 0) {
        relatorioTexto += "\n--- ENTREGAS CANCELADAS ---\n\n";
        entregasCanceladas.forEach(e => {
            relatorioTexto += `Cliente: ${e.cliente.nome}\n`;
            relatorioTexto += `Horário: ${formatarData(e.horarioEntrega)}\n`;
            relatorioTexto += `-----------------------------\n`;
        });
    }
    
    // 2. Prepara Texto para WhatsApp (Lista de Pendentes + Relatório Financeiro)
    const entregasPendentes = entregas.filter(e => e.status === 'Pendente');
    whatsappTexto += `*Entregas Pendentes (${entregasPendentes.length})*:\n`;
    if(entregasPendentes.length > 0) {
        entregasPendentes.forEach((e, index) => {
            whatsappTexto += `${index + 1}. *${e.cliente.nome}* (${e.cliente.celular || 'Sem Celular'})\n`;
            if (e.cliente.endereco) {
                whatsappTexto += `   End: ${e.cliente.endereco}\n`;
            }
            if (e.cliente.complemento) {
                whatsappTexto += `   Comp: ${e.cliente.complemento}\n`;
            }
            whatsappTexto += `   Cesta: ${e.cesta.nome} (${formatarMoeda(e.cesta.valor)})\n`;
            
            // Bloco de Observações
            if (e.brinde === 'Sim') {
                whatsappTexto += `   BRINDE: Sim\n`;
            }
            if (e.observacao) {
                whatsappTexto += `   OBS (Cliente): ${e.observacao}\n`;
            }
            if(e.tipo === 'Alterada') {
                if (e.codigoAlterada) {
                    whatsappTexto += `   OBS (Cesta): ${e.codigoAlterada}\n`;
                }
                if (e.partesAlteradas && e.partesAlteradas.length > 0) {
                    whatsappTexto += `   Partes Alteradas: ${e.partesAlteradas.join(', ')}\n`;
                }
            }
        });
    } else {
        whatsappTexto += `Nenhuma entrega pendente.\n`;
    }
    
    // Seção Relatório Financeiro
    whatsappTexto += `\n\n--- RELATÓRIO FINANCEIRO ---\n`;
    
    let totalVendido = 0;
    let totalPorCesta = {};
    let totalPorPagamento = {};

    entregasConcluidas.forEach(e => {
        const valor = e.cesta.valor;
        totalVendido += valor;
        
        // Total por Cesta
        totalPorCesta[e.cesta.nome] = (totalPorCesta[e.cesta.nome] || 0) + valor;

        // Total por Pagamento
        if (e.formaPagamento.length === 0) {
            totalPorPagamento['N/A'] = (totalPorPagamento['N/A'] || 0) + valor;
        } else {
            // Divide o valor se houver múltiplas formas
            const valorDividido = valor / e.formaPagamento.length;
            e.formaPagamento.forEach(forma => {
                totalPorPagamento[forma] = (totalPorPagamento[forma] || 0) + valorDividido;
            });
        }
    });

    whatsappTexto += `\n*Vendas Concluídas:*\n`;
    whatsappTexto += `Total Vendido: *${formatarMoeda(totalVendido)}*\n`;

    whatsappTexto += `\n*Detalhado por Cesta:*\n`;
    if (Object.keys(totalPorCesta).length > 0) {
        Object.keys(totalPorCesta).forEach(nomeCesta => {
            whatsappTexto += `   ${nomeCesta}: ${formatarMoeda(totalPorCesta[nomeCesta])}\n`;
        });
    } else {
        whatsappTexto += `   Nenhuma.\n`;
    }

    whatsappTexto += `\n*Recebimentos por Forma:*\n`;
    if (Object.keys(totalPorPagamento).length > 0) {
        Object.keys(totalPorPagamento).forEach(forma => {
            // toFixed(2) para garantir 2 casas decimais no valor, pois houve divisão
            whatsappTexto += `   ${forma}: ${formatarMoeda(totalPorPagamento[forma].toFixed(2))}\n`;
        });
    } else {
         whatsappTexto += `   Nenhum.\n`;
    }

    // Despesas
    const despesas = rotaAtiva.despesas;
    const totalDespesas = (despesas.abastecimento || 0) + (despesas.alimentacao || 0) + (despesas.extra || 0);
    
    whatsappTexto += `\n*Despesas da Rota:*\n`;
    whatsappTexto += `   Abastecimento: ${formatarMoeda(despesas.abastecimento || 0)}\n`;
    whatsappTexto += `   Alimentação: ${formatarMoeda(despesas.alimentacao || 0)}\n`;
    whatsappTexto += `   Extras: ${formatarMoeda(despesas.extra || 0)}\n`;
    whatsappTexto += `Total Despesas: *${formatarMoeda(totalDespesas)}*\n`;

    // Balanço Final
    const balanco = totalVendido - totalDespesas;
    whatsappTexto += `\n*BALANÇO FINAL (Vendido - Despesas):*\n`;
    whatsappTexto += `*${formatarMoeda(balanco)}*\n`;

    // 3. Atualiza o elemento de pré-formatação do relatório
    exportRelatorioEl.querySelector('pre').textContent = relatorioTexto;
    
    // 4. Cria link do WhatsApp
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(whatsappTexto)}`;
    exportWhatsappLinkEl.innerHTML = `
        <a href="${whatsappUrl}" target="_blank" class="inline-flex items-center justify-center w-full rounded-md border border-transparent bg-green-500 px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-green-600">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM5.5 8.5A1.5 1.5 0 017 7h6a1.5 1.5 0 011.5 1.5v3A1.5 1.5 0 0113 13H7a1.5 1.5 0 01-1.5-1.5v-3z" /></svg>
            Enviar Resumo no WhatsApp
        </a>`;

    // 5. Exibe Modal
    modalExportar.classList.remove('hidden');
}

/**
 * Lida com a importação de dados (JSON)
 * @param {string} jsonDados - A string JSON lida do arquivo.
 */
function carregarDados(jsonDados) {
    if (!jsonDados) {
        mostrarAviso("O arquivo está vazio ou não pôde ser lido.");
        return;
    }
    
    try {
        const dadosCarregados = JSON.parse(jsonDados);
        
        // Caso 1: É o formato NOVO (Objeto Rota)
        if (typeof dadosCarregados === 'object' && !Array.isArray(dadosCarregados) && dadosCarregados.entregas) {
            
            if (!dadosCarregados.id || !dadosCarregados.nome || !dadosCarregados.data) {
                throw new Error('Objeto de rota inválido. Faltando id, nome ou data.');
            }

            // Checa conflito de ID e cria um novo ID se necessário
            let novoId = dadosCarregados.id;
            if (todasAsRotas[novoId]) {
                novoId = `import-${Date.now()}`;
            }
            dadosCarregados.id = novoId;

            // Mapeia e garante que os campos essenciais existam
            dadosCarregados.despesas = dadosCarregados.despesas || { abastecimento: 0, alimentacao: 0, extra: 0 };
            dadosCarregados.entregas = dadosCarregados.entregas.map(e => ({
                // Adiciona campos novos para compatibilidade (partesAlteradas, brinde, observacao)
                brinde: e.brinde || 'Não',
                partesAlteradas: e.partesAlteradas || [],
                observacao: e.observacao || '',
                ...e,
                // Garante que o cliente é um objeto (para compatibilidade com formato antigo)
                cliente: typeof e.cliente === 'object' ? e.cliente : {
                    nome: e.codigoCliente || 'Cliente Antigo',
                    celular: e.celular || '',
                    endereco: e.endereco || e.codigoCliente || 'Sem Endereço',
                    complemento: e.complemento || ''
                }
            }));

            todasAsRotas[novoId] = dadosCarregados;
            rotaAtivaId = novoId;
            
            salvarTodasAsRotas();
            popularSelectRotas();
            carregarRotaAtiva();
            mostrarAviso(`Rota "${dadosCarregados.nome}" importada com sucesso e definida como ativa!`);

        } 
        // Caso 2: É o formato ANTIGO (Array de Entregas)
        else if (Array.isArray(dadosCarregados) && dadosCarregados.length > 0) {
            const rotaAtiva = todasAsRotas[rotaAtivaId];
            if (!rotaAtiva) {
                mostrarAviso("Nenhuma rota ativa. Crie uma nova rota antes de carregar um arquivo antigo.");
                return;
            }

            // Mapeia os dados carregados para garantir que os novos campos existam
            rotaAtiva.entregas = dadosCarregados.map(e => ({
                // Adiciona campos novos para compatibilidade (partesAlteradas, brinde, observacao)
                brinde: e.brinde || 'Não',
                partesAlteradas: e.partesAlteradas || [],
                observacao: e.observacao || '',
                ...e,
                // Garante que o cliente é um objeto
                cliente: typeof e.cliente === 'object' ? e.cliente : {
                    nome: e.codigoCliente || 'Cliente Antigo',
                    celular: e.celular || '',
                    endereco: e.endereco || e.codigoCliente || 'Sem Endereço',
                    complemento: e.complemento || ''
                }
            }));
            
            // Limpa despesas para importações antigas
            rotaAtiva.despesas = { abastecimento: 0, alimentacao: 0, extra: 0 }; 

            salvarTodasAsRotas();
            carregarRotaAtiva(); // Recarrega os inputs de despesa também
            mostrarAviso(`Lista de ${dadosCarregados.length} entregas carregada na rota ativa!`);

        } else {
            throw new Error('Formato de arquivo JSON desconhecido ou lista vazia.');
        }

    } catch (error) {
        console.error("Erro ao carregar JSON:", error);
        mostrarAviso(`Dados inválidos. Verifique o arquivo. (Erro: ${error.message})`);
    }
}

/**
 * Lida com o arquivo selecionado pelo usuário no input oculto
 * @param {Event} e - O evento de 'change' do input de arquivo.
 */
function handleArquivoCarregado(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            carregarDados(event.target.result);
        } catch (error) {
            mostrarAviso(`Erro ao processar o arquivo: ${error.message}`);
        }
    };
    reader.onerror = () => {
        mostrarAviso('Não foi possível ler o arquivo.');
    };
    reader.readAsText(file);
    
    // Reseta o input para permitir carregar o mesmo arquivo novamente
    e.target.value = null;
}

// --- Inicialização e Event Listeners ---

document.addEventListener('DOMContentLoaded', () => {

    // NOVO: Gerenciamento de Rotas
    selectRotaAtiva.addEventListener('change', (e) => {
        // Antes de mudar, salva o estado atual
        atualizarInfoRota(); 
        salvarDespesas(); 
        
        rotaAtivaId = e.target.value;
        localStorage.setItem('rotaAtivaId', rotaAtivaId);
        carregarRotaAtiva();
    });
    btnNovaRota.addEventListener('click', () => criarNovaRota(true));
    inputNomeRota.addEventListener('change', atualizarInfoRota);
    inputDataRota.addEventListener('change', atualizarInfoRota);
    btnExcluirRota.addEventListener('click', excluirRotaAtiva);

    // Listeners de Despesas
    inputDespesaAbastecimento.addEventListener('change', salvarDespesas);
    inputDespesaAlimentacao.addEventListener('change', salvarDespesas);
    inputDespesaExtra.addEventListener('change', salvarDespesas);

    // Listener para seleção de cliente
    inputCliente.addEventListener('input', (e) => {
        const nome = e.target.value.toLowerCase().trim();
        const cliente = CLIENTES_CACHE[nome];
        if (cliente) {
            displayClienteEndereco.textContent = cliente.endereco || '-';
            displayClienteComplemento.textContent = cliente.complemento || '-';
            displayClienteCelular.textContent = cliente.celular || '-';
            infoClienteSelecionado.classList.remove('hidden');
        } else {
            infoClienteSelecionado.classList.add('hidden');
        }
    });

    // Inputs do Formulário de Entrega
    selectCesta.addEventListener('change', atualizarValorCesta);
    document.querySelectorAll('input[name="tipo-cesta"]').forEach(radio => {
        radio.addEventListener('change', toggleCampoAlterada);
    });
    formEntrega.addEventListener('submit', adicionarEntrega);

    // Lista de Entregas (Delegação de Evento)
    listaEntregasEl.addEventListener('click', handleCardClick);

    // Modal de Pagamento
    btnCancelarPagamento.addEventListener('click', fecharModalPagamento);
    formPagamento.addEventListener('submit', salvarPagamento);

    // Ações Globais (Exportar/Carregar)
    btnExportar.addEventListener('click', exportarDados);
    btnFecharExportar.addEventListener('click', () => modalExportar.classList.add('hidden'));

    // Listener para o botão de download JSON (Exportar)
    document.getElementById('btn-baixar-json').addEventListener('click', () => {
        const rotaAtiva = todasAsRotas[rotaAtivaId];
        if (!rotaAtiva) return;
        
        salvarLocalStorage();
        
        const jsonDados = JSON.stringify(rotaAtiva, null, 2);
        
        // Cria um nome de arquivo descritivo
        const nomeArquivo = `rota_${rotaAtiva.nome.replace(/[^a-z0-9]/gi, '_')}_${rotaAtiva.data}.json`;
        
        downloadArquivo(jsonDados, nomeArquivo);
    });

    // Listener para o botão Carregar (trigga o input de arquivo oculto)
    btnCarregar.addEventListener('click', () => {
        inputCarregarArquivo.click();
    });

    // Listener para o input de arquivo (depois de um arquivo ser selecionado)
    inputCarregarArquivo.addEventListener('change', handleArquivoCarregado);

    // Modal de Aviso
    btnFecharAviso.addEventListener('click', fecharAviso);

    // Inicia a aplicação
    iniciarAplicativo();
    atualizarValorCesta();
});
