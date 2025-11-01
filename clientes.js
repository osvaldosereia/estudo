<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rota de Entrega</title>
    <!-- Carrega o Tailwind CSS -->
    <script src="https://cdn.tailwindcss.com"></script>
    <!-- NOVO: Carrega o Banco de Dados de Clientes -->
    <!-- Este arquivo DEVE estar na mesma pasta que este HTML -->
    <script src="clientes.js"></script>
    <style>
        /* Estilos Globais */
        body {
            /* Garante que o scroll seja suave */
            scroll-behavior: smooth;
        }

        /* Hack para esconder a barra de scroll horizontal dos filtros */
        #filtros-rota::-webkit-scrollbar {
            display: none;
        }
        #filtros-rota {
            -ms-overflow-style: none;  /* IE and Edge */
            scrollbar-width: none;  /* Firefox */
        }
        
        /* Classe para item entregue */
        .entregue {
            background-color: #f0fdf4; /* green-50 */
            border-left-color: #22c55e; /* green-500 */
        }
        .entregue .btn-entregue {
            background-color: #22c55e; /* green-500 */
            color: white;
        }

        /* Classe para item montado */
        .montado {
            background-color: #f0f9ff; /* blue-50 */
            border-left-color: #2563eb; /* blue-600 */
        }

        /* Classe para item cancelado */
        .cancelada {
            background-color: #f3f4f6; /* gray-100 */
            border-left-color: #6b7280; /* gray-500 */
            opacity: 0.7;
        }
        
        /* Classes de Rota (Cor da Borda) */
        .rota-CUIABÁ { border-left-color: #2563eb; /* blue-600 */ }
        .rota-VG { border-left-color: #db2777; /* pink-600 */ }
        .rota-CPA { border-left-color: #16a34a; /* green-600 */ }
        .rota-COXIPÓ { border-left-color: #f97316; /* orange-500 */ }

        /* Classes de Visibilidade por Modo */
        .admin-view, .entregador-view, .montador-view {
            display: none; /* Oculto por padrão */
        }

        /* Modo ADMIN (Padrão) */
        .modo-admin .admin-view {
            display: block; /* ou flex, grid, etc. */
        }
        /* CORREÇÃO: Visibilidade no mobile */
        .modo-admin .btn-top-admin {
            display: inline-flex;
        }
        .modo-admin #btn-abrir-form-modal {
            display: flex; /* Garante que o FAB apareça */
        }

        /* Modo ENTREGADOR */
        .modo-entregador .entregador-view {
            display: block; /* ou flex, grid, etc. */
        }
        .modo-entregador .btn-top-entregador {
            display: inline-flex;
        }
        .modo-entregador #btn-abrir-form-modal {
            display: none; /* Entregador não lança pedido */
        }

        /* Modo MONTADOR */
        .modo-montador .montador-view {
            display: block; /* ou flex, grid, etc. */
        }
        .modo-montador .btn-top-montador {
            display: inline-flex;
        }
        .modo-montador #btn-abrir-form-modal {
            display: none;
        }

        /* Estilo para botão de filtro de rota ativo */
        .btn-filtro-ativo {
            background-color: #1d4ed8 !important;
            color: #ffffff !important;
            border-color: #1d4ed8;
        }
        
        /* Estilos de Texto e Textarea */
        textarea { min-height: 100px; white-space: pre-wrap; }
        .pre-wrap-texto {
            white-space: pre-wrap;
            word-break: break-word;
            font-family: inherit;
            font-size: 0.875rem;
            line-height: 1.25rem;
        }

        /* Lógica de visibilidade para Modo Montador */
        .montador-hidden {
            display: block;
        }
        .modo-montador .montador-hidden {
            display: none;
        }
    </style>
</head>
<!-- CORREÇÃO: Adicionado 'modo-admin' como padrão para o FAB aparecer -->
<body class="bg-gray-100 antialiased modo-admin">
    
    <!-- =================================================================== -->
    <!-- BARRA SUPERIOR FIXA (NAV) -->
    <!-- =================================================================== -->
    <nav class="fixed top-0 left-0 right-0 z-40 bg-white shadow-md">
        <div class="container mx-auto max-w-5xl p-4">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                <!-- Título -->
                <div class="flex justify-between items-center">
                    <!-- MODIFICADO: Título -->
                    <h1 class="text-2xl font-bold text-gray-900">ROTA</h1>
                    <!-- Botões de Modo (Visíveis no Mobile, escondidos no SM+) -->
                    <div class="sm:hidden flex-shrink-0">
                        <button id="btn-top-admin" class="btn-top-nav text-xs font-medium py-2 px-3 rounded-md bg-blue-100 text-blue-700">ADMIN</button>
                        <button id="btn-top-entregador" class="btn-top-nav hidden text-xs font-medium py-2 px-3 rounded-md bg-green-100 text-green-700">ENTREGADOR</button>
                        <button id="btn-top-montador" class="btn-top-nav hidden text-xs font-medium py-2 px-3 rounded-md bg-purple-100 text-purple-700">MONTADOR</button>
                    </div>
                </div>
                <!-- Botões de Modo (Visíveis no SM+, escondidos no Mobile) -->
                <div class="hidden sm:flex sm:space-x-2 mt-2 sm:mt-0">
                    <button id="btn-modo-admin" class="btn-modo text-sm font-medium py-2 px-4 rounded-md bg-blue-100 text-blue-700">ADMIN</button>
                    <button id="btn-modo-entregador" class="btn-modo text-sm font-medium py-2 px-4 rounded-md bg-white text-gray-700 hover:bg-gray-100">ENTREGADOR</button>
                    <button id="btn-modo-montador" class="btn-modo text-sm font-medium py-2 px-4 rounded-md bg-white text-gray-700 hover:bg-gray-100">MONTADOR</button>
                </div>
            </div>
        </div>
    </nav>

    <!-- =================================================================== -->
    <!-- PÁGINA PRINCIPAL (ÚNICA) -->
    <!-- =================================================================== -->
    <main class="container mx-auto max-w-5xl p-4 mt-24 sm:mt-20">
        
        <!-- MODIFICADO: Header do Admin não é mais sticky -->
        <header id="page-rota-header" class="admin-view bg-gray-100 pt-4 pb-2 px-4 -mt-4 -mx-4 mb-4">
            <div class="container mx-auto max-w-5xl">
                <!-- MODIFICADO: Botão de toggle removido -->
                <div class="flex justify-between items-center mb-2">
                    <h2 class="text-2xl font-semibold text-gray-900">Gerenciar Rota</h2>
                </div>
                
                <!-- MODIFICADO: Conteúdo não é mais colapsável, ID removido -->
                <div class="space-y-4">
                    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div class="md:col-span-2">
                            <label for="select-rota-ativa" class="block text-sm font-medium text-gray-700">Rota Ativa</label>
                            <select id="select-rota-ativa" class="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-3 px-4 text-base">
                                <!-- Rotas serão preenchidas pelo JS -->
                            </select>
                        </div>
                        <div class="md:col-span-1">
                            <label for="btn-nova-rota" class="block text-sm font-medium text-gray-700">&nbsp;</label>
                            <button id="btn-nova-rota" class="w-full flex justify-center items-center rounded-md border border-transparent bg-green-600 px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-green-700">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" /></svg>
                                Nova Rota
                            </button>
                        </div>
                        <div class="md:col-span-1">
                            <label for="btn-excluir-rota" class="block text-sm font-medium text-gray-700">&nbsp;</label>
                             <button id="btn-excluir-rota" class="w-full flex justify-center items-center rounded-md border border-gray-300 bg-red-100 px-4 py-3 text-sm font-medium text-red-700 shadow-sm hover:bg-red-200">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1zm2 3a1 1 0 100 2h2a1 1 0 100-2H9z" clip-rule="evenodd" /></svg>
                                Excluir Rota
                            </button>
                        </div>
                        <div class="md:col-span-2">
                            <label for="input-nome-rota" class="block text-sm font-medium text-gray-700">Nome da Rota</label>
                            <input type="text" id="input-nome-rota" class="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-3 px-4 text-base" placeholder="Ex: Entregas Manhã">
                        </div>
                        <div class="md:col-span-2">
                            <label for="input-data-rota" class="block text-sm font-medium text-gray-700">Data da Rota</label>
                            <div class="flex items-center">
                                <input type="date" id="input-data-rota" class="mt-1 block w-full rounded-l-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-3 px-4 text-base">
                                <span id="display-dia-semana" class="mt-1 inline-flex items-center px-3 py-3 rounded-r-md border border-l-0 border-gray-300 bg-gray-50 text-gray-500 text-sm sm:text-base min-w-[100px] sm:min-w-[120px] justify-center">-</span>
                            </div>
                        </div>
                    </div>
                    <!-- MODIFICADO: Botões de Importar/Exportar movidos para fora do header -->
                </div>
            </div>
        </header>

        <!-- MODIFICADO: Botões de Import/Export agora são visíveis para Todos e em grid -->
        <div class="grid grid-cols-3 gap-2 mb-4">
            <button class="btn-importar-card rounded-md bg-blue-100 text-blue-700 px-4 py-3 text-sm font-medium shadow-sm hover:bg-blue-200 flex items-center justify-center text-center h-full">Importar Card</button>
            <button class="btn-exportar rounded-md bg-green-600 px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-green-700 flex items-center justify-center text-center h-full">Exportar Rota</button>
            <button class="btn-carregar rounded-md bg-gray-600 px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-gray-700 flex items-center justify-center text-center h-full">Carregar Rota</button>
        </div>

        <!-- Seção de Despesas (Entregador) - MOVIDA PARA O FIM -->
        <!-- <section id="secao-despesas" ... > ... </section> -->

        <!-- Painel de Resumo (Montador) -->
        <section id="secao-resumo" class="montador-view bg-white p-4 rounded-lg shadow-md mb-4 space-y-2">
            <h2 class="text-xl font-semibold text-gray-900 mb-2 border-b pb-2">Resumo da Montagem</h2>
            <!-- MODIFICADO: Layout de colunas para Desktop -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <!-- Coluna 1: Totais -->
                <div class="space-y-2">
                    <div>
                        <span class="block font-medium text-gray-600">Total Pedidos (Não Cancelados):</span>
                        <span id="summary-total-pedidos" class="text-lg font-bold text-gray-900">0</span>
                    </div>
                    <div>
                        <span class="block font-medium text-gray-600">Total Cestas (Não Canceladas):</span>
                        <span id="summary-total-cestas" class="text-lg font-bold text-gray-900">0</span>
                    </div>
                </div>
                <!-- Coluna 2: Breakdowns -->
                <div class="space-y-2">
                    <div>
                        <span class="block font-medium text-gray-600">Cestas por Tipo:</span>
                        <!-- MODIFICADO: text-sm e ID -->
                        <span id="summary-cestas-breakdown" class="text-sm text-gray-700 leading-relaxed">...</span>
                    </div>
                    <div>
                        <span class="block font-medium text-gray-600">Cestas por Rota:</span>
                        <!-- MODIFICADO: text-sm e ID -->
                        <span id="summary-rotas-breakdown" class="text-sm text-gray-700 leading-relaxed">...</span>
                    </div>
                </div>
                <!-- REMOVIDO: Pedidos por Rota -->
            </div>
        </section>

        <!-- MODIFICADO: Filtros de Rota agora são STICKY e roláveis no mobile -->
        <div id="filtros-rota" class="sticky top-24 sm:top-20 z-20 bg-gray-100 py-2 flex flex-nowrap overflow-x-auto gap-2 mb-4">
            <!-- REMOVIDO: Botão "TODAS" -->
            <button data-filtro="CUIABÁ" class="btn-filtro-rota btn-filtro-ativo text-sm font-medium py-2 px-4 rounded-full border border-gray-400 bg-white shadow-sm rota-CUIABÁ flex-shrink-0">
                CUIABÁ
            </button>
            <button data-filtro="VG" class="btn-filtro-rota text-sm font-medium py-2 px-4 rounded-full border border-gray-400 bg-white shadow-sm rota-VG flex-shrink-0">
                VG
            </button>
            <button data-filtro="CPA" class="btn-filtro-rota text-sm font-medium py-2 px-4 rounded-full border border-gray-400 bg-white shadow-sm rota-CPA flex-shrink-0">
                CPA
            </button>
            <button data-filtro="COXIPÓ" class="btn-filtro-rota text-sm font-medium py-2 px-4 rounded-full border border-gray-400 bg-white shadow-sm rota-COXIPÓ flex-shrink-0">
                COXIPÓ
            </button>
        </div>
        
        <!-- Lista de Cards de Entrega -->
        <div id="lista-entregas" class="space-y-4">
            <!-- Cards serão injetados aqui pelo JavaScript -->
        </div>
        <p id="lista-vazia" class="text-center text-gray-700 py-10">Nenhuma entrega na rota.</p>

        <!-- Botões de Ação (Entregador) - REMOVIDO (Movido para o topo, visível para todos) -->
        
        <!-- Seção de Despesas (Entregador) - MOVIDA PARA CÁ -->
        <section id="secao-despesas" class="bg-white p-6 rounded-lg shadow-md mb-6 entregador-view">
            <h2 class="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">Despesas da Rota</h2>
            <div class="grid grid-cols-1 gap-4 items-end">
                <div>
                    <label for="input-despesa-abastecimento" class="block text-sm font-medium text-gray-700">Abastecimento (R$)</label>
                    <input type="number" id="input-despesa-abastecimento" step="0.01" min="0" value="0" class="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-3 px-4 text-base" placeholder="0.00">
                </div>
                <div>
                    <label for="input-despesa-alimentacao" class="block text-sm font-medium text-gray-700">Alimentação (R$)</label>
                    <input type="number" id="input-despesa-alimentacao" step="0.01" min="0" value="0" class="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-3 px-4 text-base" placeholder="0.00">
                </div>
                <div>
                    <label for="input-despesa-extra" class="block text-sm font-medium text-gray-700">Extras (R$)</label>
                    <input type="number" id="input-despesa-extra" step="0.01" min="0" value="0" class="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-3 px-4 text-base" placeholder="0.00">
                </div>
            </div>
        </section>

        <!-- Espaçador para o FAB não cobrir o último card -->
        <div class="h-24"></div> 
    </main>

    <!-- =================================================================== -->
    <!-- BOTÃO FLUTUANTE (FAB) PARA ABRIR MODAL -->
    <!-- =================================================================== -->
    <!-- MODIFICADO: Removido 'admin-view' para ser controlado por JS, adicionado 'flex' -->
    <button id="btn-abrir-form-modal" class="fixed z-30 bottom-6 right-6 bg-blue-600 text-white p-4 rounded-full shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
        </svg>
    </button>

    <!-- =================================================================== -->
    <!-- MODAL DE FORMULÁRIO (Lançar/Editar) -->
    <!-- =================================================================== -->
    <div id="modal-form-entrega" class="fixed inset-0 z-50 hidden flex items-start justify-center bg-black bg-opacity-50 overflow-y-auto pt-10">
        <div class="bg-gray-100 rounded-lg shadow-xl w-full max-w-4xl m-4">
            <!-- Cabeçalho do Modal -->
            <div class="flex justify-between items-center p-4 border-b border-gray-300">
                <h3 id="modal-form-title" class="text-xl font-semibold text-gray-800">Lançar Nova Entrega</h3>
                <button id="btn-fechar-form-modal" class="text-gray-400 hover:text-gray-600">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            <!-- Formulário Principal (Dentro do Modal) -->
            <form id="form-entrega">
                <div class="p-4 space-y-4">
                    
                    <!-- Seção 1: Cliente e Rota -->
                    <div class="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                        <h4 class="text-lg font-semibold text-gray-700 mb-3">1. Cliente e Rota</h4>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label for="input-cliente" class="block text-sm font-medium text-gray-700">Cliente</label>
                                <input type="text" id="input-cliente" list="lista-clientes" required class="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-3 px-4 text-base" placeholder="Digite ou selecione um cliente...">
                                <datalist id="lista-clientes">
                                    <!-- Clientes carregados via JS -->
                                </datalist>
                            </div>
                            <div>
                                <label for="select-rota-entrega" class="block text-sm font-medium text-gray-700">Rota da Entrega</label>
                                <select id="select-rota-entrega" class="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-3 px-4 text-base">
                                    <option value="CUIABÁ">CUIABÁ</option>
                                    <option value="VG">VG</option>
                                    <option value="CPA">CPA</option>
                                    <option value="COXIPÓ">COXIPÓ</option>
                                </select>
                            </div>
                            <div id="info-cliente-selecionado" class="md:col-span-2 hidden space-y-2 text-sm text-gray-600 border-l-4 border-blue-300 pl-3 py-2 bg-blue-50 rounded-r-md">
                                <p><strong>Endereço:</strong> <span id="display-cliente-endereco">-</span></p>
                                <p><strong>Complemento:</strong> <span id="display-cliente-complemento">-</span></p>
                                <p><strong>Celular:</strong> <span id="display-cliente-celular">-</span></p>
                            </div>
                            <div class="md:col-span-2">
                                <label for="obs-cliente" class="block text-sm font-medium text-gray-700">Observação (Geral do Pedido)</label>
                                <textarea id="obs-cliente" class="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-3 px-4 text-base" placeholder="Ex: Casa azul, portão branco. Entregar após as 14h..."></textarea>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Seção 2: Cestas (Carrinho) -->
                    <div class="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                        <h4 class="text-lg font-semibold text-gray-700 mb-3">2. Cestas no Pedido</h4>
                        
                        <!-- Lista de Cestas Adicionadas -->
                        <div id="lista-cestas-no-pedido" class="space-y-2 mb-4">
                            <!-- Cestas adicionadas pelo JS aparecerão aqui -->
                        </div>
                        <p id="lista-cestas-vazia" class="text-center text-gray-500 py-4">Nenhuma cesta adicionada ao pedido.</p>
                        
                        <!-- Sub-Formulário para adicionar Cesta -->
                        <div class="bg-gray-50 p-3 rounded-md border border-gray-300">
                            <h5 class="text-md font-semibold text-gray-700 mb-3">Adicionar Cesta ao Pedido</h5>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label for="sub-select-cesta" class="block text-sm font-medium text-gray-700">Cesta Básica</label>
                                    <select id="sub-select-cesta" class="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-3 px-4 text-base">
                                        <option value="Mini Bonini" data-valor="165.00">Mini Bonini</option>
                                        <option value="Mini Koblenz" data-valor="170.00">Mini Koblenz</option>
                                        <option value="Pequena Bonini" data-valor="215.00">Pequena Bonini</option>
                                        <option value="Pequena Koblenz" data-valor="220.00">Pequena kolenz</option>
                                        <option value="mÉDIA Bonini" data-valor="320.00">Média Bonini</option>
                                        <option value="Média Koblenz" data-valor="325.00">Média Koblenz</option>
                                        <option value="Grande Bonini" data-valor="380.00">Grande Bonini</option>
                                        <option value="Grande Koblenz" data-valor="390.00">Grande koblenz</option>
                                    </select>
                                </div>
                                <div>
                                    <label for="sub-input-quantidade" class="block text-sm font-medium text-gray-700">Quantidade</label>
                                    <input type="number" id="sub-input-quantidade" value="1" min="1" class="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-3 px-4 text-base">
                                </div>
                                <div class="space-y-2">
                                    <label class="block text-sm font-medium text-gray-700">Tipo da Cesta</label>
                                    <div class="flex space-x-4">
                                        <label class="flex items-center">
                                            <input type="radio" name="sub-tipo-cesta" value="Normal" checked class="h-4 w-4 border-gray-400 text-blue-600 focus:ring-blue-500">
                                            <span class="ml-2 text-sm text-gray-700">Normal</span>
                                        </label>
                                        <label class="flex items-center">
                                            <input type="radio" name="sub-tipo-cesta" value="Alterada" class="h-4 w-4 border-gray-400 text-blue-600 focus:ring-blue-500">
                                            <span class="ml-2 text-sm text-gray-700">Alterada</span>
                                        </label>
                                    </div>
                                </div>
                                <div class="space-y-2">
                                    <label class="block text-sm font-medium text-gray-700">Brinde?</label>
                                    <div class="flex space-x-4">
                                        <label class="flex items-center">
                                            <input type="radio" name="sub-brinde" value="Não" checked class="h-4 w-4 border-gray-400 text-blue-600 focus:ring-blue-500">
                                            <span class="ml-2 text-sm text-gray-700">Não</span>
                                        </label>
                                        <label class="flex items-center">
                                            <input type="radio" name="sub-brinde" value="Sim" class="h-4 w-4 border-gray-400 text-blue-600 focus:ring-blue-500">
                                            <span class="ml-2 text-sm text-gray-700">Sim</span>
                                        </label>
                                    </div>
                                </div>
                                <!-- MODIFICADO: Campo Brinde (Checkboxes) -->
                                <div id="sub-campo-brinde" class="hidden md:col-span-2 space-y-2">
                                    <label class="block text-sm font-medium text-gray-700">Opções de Brinde (Múltiplo)</label>
                                    <div class="grid grid-cols-2 gap-2">
                                        <label class="flex items-center p-2 bg-white rounded-md border border-gray-300 has-[:checked]:bg-pink-50 has-[:checked]:border-pink-400">
                                            <input type="checkbox" name="sub-brinde-opcoes" value="OVO" class="h-4 w-4 border-gray-400 text-pink-600 focus:ring-pink-500 rounded">
                                            <span class="ml-3 text-sm font-medium text-gray-700">OVO</span>
                                        </label>
                                        <label class="flex items-center p-2 bg-white rounded-md border border-gray-300 has-[:checked]:bg-pink-50 has-[:checked]:border-pink-400">
                                            <input type="checkbox" name="sub-brinde-opcoes" value="AMACIANTE" class="h-4 w-4 border-gray-400 text-pink-600 focus:ring-pink-500 rounded">
                                            <span class="ml-3 text-sm font-medium text-gray-700">AMACIANTE</span>
                                        </label>
                                        <label class="flex items-center p-2 bg-white rounded-md border border-gray-300 has-[:checked]:bg-pink-50 has-[:checked]:border-pink-400">
                                            <input type="checkbox" name="sub-brinde-opcoes" value="CAFÉ 250g" class="h-4 w-4 border-gray-400 text-pink-600 focus:ring-pink-500 rounded">
                                            <span class="ml-3 text-sm font-medium text-gray-700">CAFÉ 250g</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                            <div class="md:col-span-1 space-y-4">
                                <div id="sub-campo-alterada" class="hidden space-y-4 mt-4">
                                    <!-- NOVO: Campo Código Final -->
                                    <div>
                                        <label for="sub-codigo-final" class="block text-sm font-medium text-gray-700">Código Final (Opcional)</label>
                                        <input type="text" id="sub-codigo-final" class="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-3 px-4 text-base" placeholder="Ex: 1020-A">
                                    </div>
                                    <div>
                                        <label for="sub-codigo-alterada" class="block text-sm font-medium text-gray-700">Detalhe (Cesta Alterada)</label>
                                        <textarea id="sub-codigo-alterada" class="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-3 px-4 text-base" placeholder="Ex: Sem arroz, +1 feijão"></textarea>
                                    </div>
                                    <div id="sub-campo-partes-alteradas">
                                        <label class="block text-sm font-medium text-gray-700">Partes Alteradas (Múltiplo)</label>
                                        <div class="mt-2 grid grid-cols-2 gap-2">
                                            <label class="flex items-center p-2 bg-white rounded-md border border-gray-300 has-[:checked]:bg-blue-50 has-[:checked]:border-blue-400">
                                                <input type="checkbox" name="sub-partes_alteradas" value="Arroz" class="h-4 w-4 border-gray-400 text-blue-600 focus:ring-blue-500 rounded">
                                                <span class="ml-3 text-sm font-medium text-gray-700">Arroz</span>
                                            </label>
                                            <label class="flex items-center p-2 bg-white rounded-md border border-gray-300 has-[:checked]:bg-blue-50 has-[:checked]:border-blue-400">
                                                <input type="checkbox" name="sub-partes_alteradas" value="Alimento" class="h-4 w-4 border-gray-400 text-blue-600 focus:ring-blue-500 rounded">
                                                <span class="ml-3 text-sm font-medium text-gray-700">Alimento</span>
                                            </label>
                                            <label class="flex items-center p-2 bg-white rounded-md border border-gray-300 has-[:checked]:bg-blue-50 has-[:checked]:border-blue-400">
                                                <input type="checkbox" name="sub-partes_alteradas" value="Limpeza" class="h-4 w-4 border-gray-400 text-blue-600 focus:ring-blue-500 rounded">
                                                <span class="ml-3 text-sm font-medium text-gray-700">Limpeza</span>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <button type="button" id="btn-adicionar-cesta" class="w-full mt-4 flex justify-center items-center rounded-md border border-transparent bg-blue-600 px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-blue-700">
                                Adicionar Cesta ao Pedido
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Rodapé do Modal (Ações) -->
                <div class="bg-gray-200 p-4 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div class="text-left">
                        <span class="text-sm text-gray-600">Valor Total do Pedido</span>
                        <div id="display-valor-total" class="text-2xl font-bold text-gray-900">
                            R$ 0,00
                        </div>
                    </div>
                    <button type="submit" id="btn-submit-form" class="w-full sm:w-auto flex justify-center items-center rounded-md border border-transparent bg-green-600 px-6 py-3 text-base font-medium text-white shadow-sm hover:bg-green-700">
                        <span id="btn-submit-form-text">Lançar Entrega</span>
                    </button>
                </div>
            </form>
        </div>
    </div>
    
    <!-- =================================================================== -->
    <!-- MODAL DE PAGAMENTO (Entregador) -->
    <!-- =================================================================== -->
    <div id="modal-pagamento" class="fixed inset-0 z-50 hidden flex items-center justify-center bg-black bg-opacity-50">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-md m-4">
            <form id="form-pagamento">
                <div class="p-6">
                    <h3 class="text-xl font-semibold text-gray-800 mb-4">Confirmar Entrega e Pagamento</h3>
                    <p class="text-sm text-gray-600 mb-1">Cliente: <strong id="modal-cliente-nome"></strong></p>
                    <p class="text-sm text-gray-600 mb-4">Valor Total: <strong id="modal-cliente-valor"></strong></p>
                    
                    <label class="block text-sm font-medium text-gray-700 mb-2">Forma(s) de Pagamento (Selecione ao menos uma):</label>
                    <div id="modal-error-pagamento" class="text-red-600 text-sm mb-2 hidden">É obrigatório selecionar ao menos uma forma de pagamento.</div>
                    <div class="space-y-2">
                        <label class="flex items-center p-3 bg-gray-50 rounded-md border border-gray-200 has-[:checked]:bg-blue-50 has-[:checked]:border-blue-400">
                            <input type="checkbox" name="forma_pagamento" value="Dinheiro" class="h-4 w-4 border-gray-400 text-blue-600 focus:ring-blue-500 rounded">
                            <span class="ml-3 text-sm font-medium text-gray-700">Dinheiro</span>
                        </label>
                        <label class="flex items-center p-3 bg-gray-50 rounded-md border border-gray-200 has-[:checked]:bg-blue-50 has-[:checked]:border-blue-400">
                            <input type="checkbox" name="forma_pagamento" value="Pix" class="h-4 w-4 border-gray-400 text-blue-600 focus:ring-blue-500 rounded">
                            <span class="ml-3 text-sm font-medium text-gray-700">Pix</span>
                        </label>
                        <label class="flex items-center p-3 bg-gray-50 rounded-md border border-gray-200 has-[:checked]:bg-blue-50 has-[:checked]:border-blue-400">
                            <input type="checkbox" name="forma_pagamento" value="Cartão" class="h-4 w-4 border-gray-400 text-blue-600 focus:ring-blue-500 rounded">
                            <span class="ml-3 text-sm font-medium text-gray-700">Cartão</span>
                        </label>
                        <label class="flex items-center p-3 bg-gray-50 rounded-md border border-gray-200 has-[:checked]:bg-blue-50 has-[:checked]:border-blue-400">
                            <input type="checkbox" name="forma_pagamento" value="Fiado" class="h-4 w-4 border-gray-400 text-blue-600 focus:ring-blue-500 rounded">
                            <span class="ml-3 text-sm font-medium text-gray-700">Fiado</span>
                        </label>
                    </div>
                </div>
                <div class="bg-gray-50 px-6 py-4 flex justify-end space-x-3 rounded-b-lg">
                    <button type="button" id="btn-cancelar-pagamento" class="rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">Cancelar</button>
                    <button type="submit" id="btn-confirmar-pagamento" class="rounded-md border border-transparent bg-blue-600 px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-blue-700">Confirmar Entrega</button>
                </div>
            </form>
        </div>
    </div>

    <!-- =================================================================== -->
    <!-- MODAL DE AÇÕES DO WHATSAPP (Entregador) -->
    <!-- =================================================================== -->
    <div id="modal-whatsapp" class="fixed inset-0 z-50 hidden flex items-center justify-center bg-black bg-opacity-50">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-md m-4">
            <div class="p-6">
                <h3 class="text-xl font-semibold text-gray-800 mb-2">Ação WhatsApp</h3>
                <p class="text-sm text-gray-600 mb-4">Escolha uma ação para o cliente: <strong id="modal-wpp-cliente-nome"></strong></p>
                <div class="space-y-3">
                    <button data-acao="avisar-chegando" class="btn-acao-wpp w-full flex items-center text-left rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-3 text-blue-500" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" /></svg>
                        Avisar (Estou Chegando)
                    </button>
                    <button data-acao="avisar-na-porta" class="btn-acao-wpp w-full flex items-center text-left rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-3 text-yellow-500" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>
                        Avisar (Cheguei na Porta)
                    </button>
                    <button data-acao="agradecer" class="btn-acao-wpp w-full flex items-center text-left rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-3 text-green-500" viewBox="0 0 20 20" fill="currentColor"><path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18H10a2 2 0 002-2v-6.333a2 2 0 00-1.106-1.79l-.05-.025A4 4 0 008.943 6H8a2 2 0 00-2 2v2.333zM10 15a1 1 0 100-2 1 1 0 000 2zm4-2a1 1 0 100-2 1 1 0 000 2z" /></svg>
                        Agradecer (Pós-Venda)
                    </button>
                    <button data-acao="enviar-pix" class="btn-acao-wpp w-full flex items-center text-left rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-3 text-gray-500" viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" /><path fill-rule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm3 0a1 1 0 011-1h1a1 1 0 110 2H8a1 1 0 01-1-1zm3 0a1 1 0 011-1h1a1 1 0 110 2h-1a1 1 0 01-1-1z" clip-rule="evenodd" /></svg>
                        Enviar Chave Pix
                    </button>
                    <button data-acao="compartilhar-admin" class="btn-acao-wpp w-full flex items-center text-left rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-3 text-red-500" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 1 1 0 000-2zM2 8a1 1 0 100 2 1 1 0 000-2z" clip-rule="evenodd" /></svg>
                        Compartilhar Pedido (Admin)
                    </button>
                </div>
            </div>
            <div class="bg-gray-50 px-6 py-4 flex justify-end rounded-b-lg">
                <button type="button" id="btn-fechar-whatsapp" class="rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">Fechar</button>
            </div>
        </div>
    </div>

    <!-- =================================================================== -->
    <!-- MODAL DE EXPORTAR (Admin / Entregador) -->
    <!-- =================================================================== -->
    <div id="modal-exportar" class="fixed inset-0 z-50 hidden flex items-center justify-center bg-black bg-opacity-50">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl m-4 overflow-hidden">
            <div class="p-6">
                <h3 class="text-xl font-semibold text-gray-800 mb-4">Exportar Rota</h3>
                
                <label class="block text-sm font-medium text-gray-700 mb-2">Backup da Rota (Arquivo)</label>
                <button type="button" id="btn-baixar-json" class="w-full flex justify-center items-center rounded-md border border-transparent bg-blue-600 px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Baixar/Compartilhar Arquivo da Rota (.json)
                </button>

                <h4 class="text-lg font-semibold text-gray-700 mt-6 mb-2">Relatório de Entregas Concluídas</h4>
                <div id="export-relatorio" class="w-full max-h-48 overflow-y-auto p-2 border border-gray-300 rounded-md bg-gray-50">
                    <pre class="text-xs text-gray-700">Nenhuma entrega concluída.</pre>
                </div>

                <!-- MODIFICADO: Seleção de Rotas para Resumo WPP -->
                <div id="export-whatsapp-seletor" class="mt-4">
                    <label class="block text-sm font-medium text-gray-700 mb-2">Selecione as rotas para o Resumo WhatsApp:</label>
                    <div id="export-wpp-error" class="text-red-600 text-sm mb-2 hidden">Selecione ao menos uma rota.</div>
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <label class="flex items-center p-2 bg-gray-50 rounded-md border border-gray-300 has-[:checked]:bg-blue-50 has-[:checked]:border-blue-400">
                            <input type="checkbox" name="export-rota-wpp" value="CUIABÁ" class="h-4 w-4 border-gray-400 text-blue-600 focus:ring-blue-500 rounded">
                            <span class="ml-3 text-sm font-medium text-gray-700">CUIABÁ</span>
                        </label>
                        <label class="flex items-center p-2 bg-gray-50 rounded-md border border-gray-300 has-[:checked]:bg-blue-50 has-[:checked]:border-blue-400">
                            <input type="checkbox" name="export-rota-wpp" value="VG" class="h-4 w-4 border-gray-400 text-blue-600 focus:ring-blue-500 rounded">
                            <span class="ml-3 text-sm font-medium text-gray-700">VG</span>
                        </label>
                        <label class="flex items-center p-2 bg-gray-50 rounded-md border border-gray-300 has-[:checked]:bg-blue-50 has-[:checked]:border-blue-400">
                            <input type="checkbox" name="export-rota-wpp" value="CPA" class="h-4 w-4 border-gray-400 text-blue-600 focus:ring-blue-500 rounded">
                            <span class="ml-3 text-sm font-medium text-gray-700">CPA</span>
                        </label>
                        <label class="flex items-center p-2 bg-gray-50 rounded-md border border-gray-300 has-[:checked]:bg-blue-50 has-[:checked]:border-blue-400">
                            <input type="checkbox" name="export-rota-wpp" value="COXIPÓ" class="h-4 w-4 border-gray-400 text-blue-600 focus:ring-blue-500 rounded">
                            <span class="ml-3 text-sm font-medium text-gray-700">COXIPÓ</span>
                        </label>
                    </div>
                </div>
                <div id="export-whatsapp-link" class="mt-4">
                    <!-- Link do WhatsApp será gerado aqui -->
                    <button type="button" id="btn-gerar-resumo-wpp" class="inline-flex items-center justify-center w-full rounded-md border border-transparent bg-green-500 px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-green-600">
                        Gerar Resumo WhatsApp
                    </button>
                </div>
            </div>
            <div class="bg-gray-50 px-6 py-4 flex justify-end rounded-b-lg">
                <button type="button" id="btn-fechar-exportar" class="rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">Fechar</button>
            </div>
        </div>
    </div>

    <!-- =================================================================== -->
    <!-- MODAL DE AVISO (Global) -->
    <!-- =================================================================== -->
    <div id="modal-aviso" class="fixed inset-0 z-50 hidden flex items-center justify-center bg-black bg-opacity-50">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-sm m-4">
            <div class="p-6">
                <h3 id="modal-aviso-titulo" class="text-xl font-semibold text-gray-800 mb-4">Atenção</h3>
                <p id="modal-aviso-texto" class="text-gray-600 mb-6">Mensagem de aviso.</p>
            </div>
            <div class="bg-gray-50 px-6 py-4 flex justify-end rounded-b-lg">
                <button type="button" id="btn-fechar-aviso" class="rounded-md border border-transparent bg-blue-600 px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-blue-700">OK</button>
            </div>
        </div>
    </div>

    <!-- Inputs de Arquivo (Ocultos) -->
    <input type="file" id="input-carregar-arquivo" class="hidden" accept=".json,application/json">
    <input type="file" id="input-carregar-card" class="hidden" accept=".json,application/json">


    <script>
        document.addEventListener('DOMContentLoaded', () => {

            // --- Constantes ---
            const MAX_ROTAS = 30; // Limite de rotas salvas
            const ADMIN_WHATSAPP_NUMBER = "65984491018"; // Número para compartilhar pedido
            const CHAVE_PIX_PADRAO = "65984491018 - PIX CELULAR"; // Chave Pix Padrão

            // --- Seletores de Elementos ---
            
            // Navegação (Top Bar e Modos)
            const body = document.body;
            const btnModoAdmin = document.getElementById('btn-modo-admin');
            const btnModoEntregador = document.getElementById('btn-modo-entregador');
            const btnModoMontador = document.getElementById('btn-modo-montador');
            const btnTopAdmin = document.getElementById('btn-top-admin');
            const btnTopEntregador = document.getElementById('btn-top-entregador');
            const btnTopMontador = document.getElementById('btn-top-montador');
            
            // Gerenciamento de Rotas (Admin Header)
            const btnNovaRota = document.getElementById('btn-nova-rota');
            const selectRotaAtiva = document.getElementById('select-rota-ativa');
            const inputNomeRota = document.getElementById('input-nome-rota');
            const inputDataRota = document.getElementById('input-data-rota');
            const displayDiaSemana = document.getElementById('display-dia-semana');
            const btnExcluirRota = document.getElementById('btn-excluir-rota');
            
            // Despesas (Entregador)
            const inputDespesaAbastecimento = document.getElementById('input-despesa-abastecimento');
            const inputDespesaAlimentacao = document.getElementById('input-despesa-alimentacao');
            const inputDespesaExtra = document.getElementById('input-despesa-extra');

            // Resumo (Montador)
            const summaryTotalPedidos = document.getElementById('summary-total-pedidos');
            const summaryTotalCestas = document.getElementById('summary-total-cestas');
            const summaryCestasBreakdown = document.getElementById('summary-cestas-breakdown');
            const summaryRotasBreakdown = document.getElementById('summary-rotas-breakdown');

            // Filtros de Rota
            const filtrosRotaEl = document.getElementById('filtros-rota');

            // Lista de Entregas
            const listaEntregasEl = document.getElementById('lista-entregas');
            const listaVaziaEl = document.getElementById('lista-vazia');

            // Modal Formulário (Lançar/Editar)
            const btnAbrirFormModal = document.getElementById('btn-abrir-form-modal');
            const modalFormEntrega = document.getElementById('modal-form-entrega');
            const btnFecharFormModal = document.getElementById('btn-fechar-form-modal');
            const modalFormTitle = document.getElementById('modal-form-title');
            const formEntrega = document.getElementById('form-entrega');
            const btnSubmitForm = document.getElementById('btn-submit-form');
            const btnSubmitFormText = document.getElementById('btn-submit-form-text');
            const displayValorTotal = document.getElementById('display-valor-total');
            
            // Modal Form -> Cliente
            const inputCliente = document.getElementById('input-cliente');
            const datalistClientes = document.getElementById('lista-clientes');
            const infoClienteSelecionado = document.getElementById('info-cliente-selecionado');
            const displayClienteEndereco = document.getElementById('display-cliente-endereco');
            const displayClienteComplemento = document.getElementById('display-cliente-complemento');
            const displayClienteCelular = document.getElementById('display-cliente-celular');
            const obsClienteInput = document.getElementById('obs-cliente');
            const selectRotaEntrega = document.getElementById('select-rota-entrega');

            // Modal Form -> Sub-Formulário (Adicionar Cesta)
            const btnAdicionarCesta = document.getElementById('btn-adicionar-cesta');
            const subSelectCesta = document.getElementById('sub-select-cesta');
            const subInputQuantidade = document.getElementById('sub-input-quantidade');
            const subCampoBrinde = document.getElementById('sub-campo-brinde');
            // const subInputBrindeDescricao = document.getElementById('sub-input-brinde-descricao'); // REMOVIDO
            const subCampoAlterada = document.getElementById('sub-campo-alterada');
            const subCodigoAlterada = document.getElementById('sub-codigo-alterada');
            const subCodigoFinal = document.getElementById('sub-codigo-final');

            // Modal Form -> Lista de Cestas (Carrinho)
            const listaCestasNoPedidoEl = document.getElementById('lista-cestas-no-pedido');
            const listaCestasVaziaEl = document.getElementById('lista-cestas-vazia');
            
            // Modal Pagamento
            const modalPagamento = document.getElementById('modal-pagamento');
            const formPagamento = document.getElementById('form-pagamento');
            const btnCancelarPagamento = document.getElementById('btn-cancelar-pagamento');
            const modalClienteNome = document.getElementById('modal-cliente-nome');
            const modalClienteValor = document.getElementById('modal-cliente-valor');
            const modalErrorPagamento = document.getElementById('modal-error-pagamento');

            // Modal WhatsApp
            const modalWhatsApp = document.getElementById('modal-whatsapp');
            const modalWppClienteNome = document.getElementById('modal-wpp-cliente-nome');
            const btnFecharWhatsApp = document.getElementById('btn-fechar-whatsapp');

            /* MODIFICADO: Seletores de Botão por CLASSE */
            const btnsExportar = document.querySelectorAll('.btn-exportar');
            const btnsCarregar = document.querySelectorAll('.btn-carregar');
            const btnsImportarCard = document.querySelectorAll('.btn-importar-card');
            
            // Modal Exportar
            const modalExportar = document.getElementById('modal-exportar');
            const exportRelatorioEl = document.getElementById('export-relatorio');
            const exportWhatsappLinkEl = document.getElementById('export-whatsapp-link');
            const btnBaixarJson = document.getElementById('btn-baixar-json');
            const btnFecharExportar = document.getElementById('btn-fechar-exportar');
            const btnGerarResumoWpp = document.getElementById('btn-gerar-resumo-wpp'); // NOVO
            const exportWppError = document.getElementById('export-wpp-error'); // NOVO

            // Modal Aviso
            const modalAviso = document.getElementById('modal-aviso');
            const modalAvisoTitulo = document.getElementById('modal-aviso-titulo');
            const modalAvisoTexto = document.getElementById('modal-aviso-texto');
            const btnFecharAviso = document.getElementById('btn-fechar-aviso');

            // Inputs de Arquivo
            const inputCarregarArquivo = document.getElementById('input-carregar-arquivo');
            const inputCarregarCard = document.getElementById('input-carregar-card');


            // --- Estado da Aplicação ---
            let todasAsRotas = {}; // Objeto para guardar todas as rotas
            let rotaAtivaId = null; // ID da rota sendo visualizada
            let CLIENTES_CACHE = {}; // Cache para busca rápida de clientes por nome

            let entregaParaPagarId = null; // ID da entrega no modal de pagamento
            let whatsAppEntregaId = null; // ID da entrega no modal de WhatsApp
            let editingEntregaId = null;
            
            let cestasDoPedidoAtual = []; // "Carrinho" do formulário
            let filtroRotaAtiva = 'CUIABÁ'; // MODIFICADO: Padrão alterado
            let modoAtual = 'admin'; // 'admin', 'entregador', 'montador'

            // --- Funções ---

            // --- Funções de UI (Modo, Modais, etc) ---

            /**
             * Alterna a visualização do app (Admin, Entregador, Montador)
             */
            function setModoVisualizacao(modo) {
                modoAtual = modo;
                // CORREÇÃO: Garante que a classe base sempre exista
                body.className = `bg-gray-100 antialiased modo-${modo}`;
                
                // Atualiza botões da barra superior (mobile)
                [btnTopAdmin, btnTopEntregador, btnTopMontador].forEach(btn => btn.classList.add('hidden'));
                document.getElementById(`btn-top-${modo}`).classList.remove('hidden');

                // Atualiza botões da barra superior (desktop)
                [btnModoAdmin, btnModoEntregador, btnModoMontador].forEach(btn => {
                    btn.classList.remove('bg-blue-100', 'text-blue-700', 'bg-green-100', 'text-green-700', 'bg-purple-100', 'text-purple-700');
                    btn.classList.add('bg-white', 'text-gray-700', 'hover:bg-gray-100');
                });
                
                let btnAtivoDesktop = document.getElementById(`btn-modo-${modo}`);
                btnAtivoDesktop.classList.remove('bg-white', 'text-gray-700', 'hover:bg-gray-100');
                if (modo === 'admin') btnAtivoDesktop.classList.add('bg-blue-100', 'text-blue-700');
                if (modo === 'entregador') btnAtivoDesktop.classList.add('bg-green-100', 'text-green-700');
                if (modo === 'montador') btnAtivoDesktop.classList.add('bg-purple-100', 'text-purple-700');
                
                // Atualiza a visualização dos cards e do resumo
                renderizarEntregas();
                renderizarResumo();
            }
            
            function mostrarAviso(mensagem, titulo = "Atenção") {
                modalAvisoTitulo.textContent = titulo;
                modalAvisoTexto.textContent = mensagem;
                modalAviso.classList.remove('hidden');
            }
            function fecharAviso() {
                modalAviso.classList.add('hidden');
            }

            function abrirFormModal() {
                modalFormEntrega.classList.remove('hidden');
                body.classList.add('overflow-hidden'); // Trava o scroll do body
            }
            function fecharFormModal() {
                modalFormEntrega.classList.add('hidden');
                body.classList.remove('overflow-hidden');
            }
            
            // --- Funções de Formatação ---

            function formatarMoeda(valor) {
                return parseFloat(valor).toLocaleString('pt-br', { style: 'currency', currency: 'BRL' });
            }
            function formatarData(isoString) {
                if (!isoString) return '';
                const data = new Date(isoString);
                return data.toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            }
            function getDiaDaSemana(dataString) {
                if (!dataString) return '-';
                const data = new Date(dataString + 'T12:00:00'); // Evita fuso
                const dia = data.toLocaleDateString('pt-BR', { weekday: 'long' });
                return dia.charAt(0).toUpperCase() + dia.slice(1);
            }
            function normalizarString(str) {
                if (typeof str !== 'string') return '';
                return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
            }

            // --- Funções de Gerenciamento de Rotas (Admin) ---

            function salvarTodasAsRotas() {
                // Gerenciamento de limite (MAX_ROTAS)
                const chavesRotas = Object.keys(todasAsRotas);
                if (chavesRotas.length > MAX_ROTAS) {
                    const chavesOrdenadas = chavesRotas.sort((a, b) => a - b);
                    const chavesParaRemover = chavesOrdenadas.slice(0, chavesOrdenadas.length - MAX_ROTAS);
                    chavesParaRemover.forEach(chave => delete todasAsRotas[chave]);
                }
                localStorage.setItem('gerenciadorDeRotas', JSON.stringify(todasAsRotas));
                if (rotaAtivaId) {
                    localStorage.setItem('rotaAtivaId', rotaAtivaId);
                }
            }

            function getEntregasAtivas() {
                if (rotaAtivaId && todasAsRotas[rotaAtivaId]) {
                    return todasAsRotas[rotaAtivaId].entregas;
                }
                return [];
            }
            function getRotaAtiva() {
                if (rotaAtivaId && todasAsRotas[rotaAtivaId]) {
                    return todasAsRotas[rotaAtivaId];
                }
                return null;
            }

            function popularSelectRotas() {
                selectRotaAtiva.innerHTML = '';
                const chavesOrdenadas = Object.keys(todasAsRotas).sort((a, b) => b - a);
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

            function carregarRotaAtiva() {
                const rota = getRotaAtiva();
                if (!rota) {
                    if (Object.keys(todasAsRotas).length === 0) {
                        criarNovaRota(false);
                    } else {
                        rotaAtivaId = Object.keys(todasAsRotas)[0];
                        localStorage.setItem('rotaAtivaId', rotaAtivaId);
                    }
                    popularSelectRotas();
                    carregarRotaAtiva();
                    return;
                }

                inputNomeRota.value = rota.nome;
                inputDataRota.value = rota.data;
                displayDiaSemana.textContent = getDiaDaSemana(rota.data);

                rota.despesas = rota.despesas || { abastecimento: 0, alimentacao: 0, extra: 0 };
                inputDespesaAbastecimento.value = rota.despesas.abastecimento || 0;
                inputDespesaAlimentacao.value = rota.despesas.alimentacao || 0;
                inputDespesaExtra.value = rota.despesas.extra || 0;

                selectRotaAtiva.value = rotaAtivaId;
                
                renderizarEntregas();
                renderizarResumo();
            }

            function criarNovaRota(atualizarTela = true) {
                const novoId = Date.now().toString();
                const hoje = new Date().toISOString().split('T')[0];
                const novaRota = {
                    id: novoId,
                    nome: "Nova Rota",
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
                }
            }

            function atualizarInfoRota() {
                const rota = getRotaAtiva();
                if (!rota) return;
                rota.nome = inputNomeRota.value || "Rota Sem Nome";
                rota.data = inputDataRota.value;
                displayDiaSemana.textContent = getDiaDaSemana(rota.data);
                salvarTodasAsRotas();
                popularSelectRotas();
            }

            function salvarDespesas() {
                const rota = getRotaAtiva();
                if (!rota) return;
                rota.despesas = {
                    abastecimento: parseFloat(inputDespesaAbastecimento.value) || 0,
                    alimentacao: parseFloat(inputDespesaAlimentacao.value) || 0,
                    extra: parseFloat(inputDespesaExtra.value) || 0
                };
                salvarTodasAsRotas();
            }

            function excluirRotaAtiva() {
                 if (Object.keys(todasAsRotas).length <= 1) {
                    mostrarAviso("Você não pode excluir a última rota.");
                    return;
                }
                delete todasAsRotas[rotaAtivaId];
                const chavesOrdenadas = Object.keys(todasAsRotas).sort((a, b) => b - a);
                rotaAtivaId = chavesOrdenadas[0];
                salvarTodasAsRotas();
                popularSelectRotas();
                carregarRotaAtiva();
            }

            /**
             * Função de compatibilidade. Transforma pedidos antigos (cesta única)
             * no novo formato (array de cestas).
             */
            function migrarFormatoCestas(entrega) {
                if (Array.isArray(entrega.cestas)) {
                    // Garante que o formato novo tenha os campos novos (brindeOpcoes)
                    return entrega.cestas.map(cesta => ({
                        ...cesta,
                        brindeOpcoes: cesta.brindeOpcoes || (cesta.brindeDescricao ? [cesta.brindeDescricao] : [])
                    }));
                }
                // Formato antigo: migra
                if (entrega.cesta && entrega.cesta.nome) {
                    return [{
                        nome: entrega.cesta.nome,
                        valor: entrega.cesta.valor,
                        quantidade: entrega.quantidade || 1,
                        tipo: entrega.tipo || 'Normal',
                        brinde: entrega.brinde || 'Não',
                        brindeDescricao: entrega.brindeDescricao || '', // Mantém por segurança
                        brindeOpcoes: entrega.brindeOpcoes || (entrega.brindeDescricao ? [entrega.brindeDescricao] : []), // Migra brindeDescricao
                        codigoAlterada: entrega.codigoAlterada || '',
                        codigoFinal: entrega.codigoFinal || '',
                        partesAlteradas: entrega.partesAlteradas || []
                    }];
                }
                return []; // Formato inválido ou vazio
            }

            // --- Funções de Renderização (Cards e Resumo) ---

            function renderizarEntregas() {
                listaEntregasEl.innerHTML = '';
                const entregas = getEntregasAtivas();

                const entregasFiltradas = entregas.filter(e => {
                    const rotaPedido = e.rotaEntrega || 'N/A';
                    if (filtroRotaAtiva === 'TODOS') return true; // Mantido por segurança, embora 'TODOS' não exista mais no UI
                    return rotaPedido === filtroRotaAtiva;
                });
                
                const entregasOrdenadas = entregasFiltradas;

                if (entregasOrdenadas.length === 0) {
                    listaVaziaEl.classList.remove('hidden');
                    return;
                }
                listaVaziaEl.classList.add('hidden');

                entregasOrdenadas.forEach((entrega, index) => {
                    const card = document.createElement('div');
                    card.dataset.id = entrega.id;
                    
                    let rotaClass = `rota-${entrega.rotaEntrega || 'N/A'}`;
                    let statusClass = '';
                    if (entrega.status === 'Entregue') statusClass = 'entregue';
                    if (entrega.status === 'Cancelada') statusClass = 'cancelada';
                    if (entrega.status === 'Montado') statusClass = 'montado';

                    card.className = `bg-white p-4 rounded-lg shadow-sm border border-gray-200 border-l-4 flex flex-col w-full overflow-hidden ${rotaClass} ${statusClass}`;
                    
                    let obsInfo = '';
                    if (entrega.observacao) {
                        obsInfo = `
                            <div class="mt-2 p-2 bg-red-50 border border-red-200 rounded-md">
                                <span class="text-xs font-bold text-red-700">OBSERVAÇÃO:</span>
                                <p class="pre-wrap-texto text-red-700">${entrega.observacao}</p>
                            </div>
                        `;
                    }
                    
                    let statusInfo = '';
                    if (entrega.status === 'Entregue') {
                        statusInfo = `<div class="text-xs text-green-700 mt-2"><span class="font-semibold">Pagamento:</span> ${entrega.formaPagamento.join(', ')} | <span class="font-semibold">Horário:</span> ${formatarData(entrega.horarioEntrega)}</div>`;
                    } else if (entrega.status === 'Cancelada') {
                        statusInfo = `<div class="text-xs text-red-700 mt-2"><span class="font-semibold">Status:</span> CANCELADA | <span class="font-semibold">Horário:</span> ${formatarData(entrega.horarioEntrega)}</div>`;
                    } else if (entrega.status === 'Montado') {
                        statusInfo = `<div class="text-xs text-blue-700 mt-2"><span class="font-semibold">Status:</span> MONTADO | <span class="font-semibold">Horário:</span> ${formatarData(entrega.horarioMontagem)}</div>`;
                    }
                    
                    let idInfo = ''; 

                    let infoClienteHtml = `
                        <div class="flex-1 min-w-0">
                            ${idInfo}
                            <p class="text-xl font-semibold text-gray-900 break-words" title="${entrega.cliente.nome}">${entrega.cliente.nome}</p>
                            <p class="text-sm text-gray-700 break-words montador-hidden" title="${entrega.cliente.endereco || ''}">${entrega.cliente.endereco || 'Sem endereço'}</p>
                            <p class="text-sm text-gray-700 break-words montador-hidden" title="${entrega.cliente.complemento || ''}">${entrega.cliente.complemento || 'Sem complemento'}</p>
                            <p class="text-sm text-gray-700 break-words montador-hidden" title="${entrega.cliente.celular || ''}">Cel: ${entrega.cliente.celular || 'Sem celular'}</p>
                            ${obsInfo}
                        </div>
                        <div class="flex flex-col items-center justify-center admin-view ml-2">
                            <button class="btn-mover-cima text-gray-400 p-2 ${index === 0 ? 'opacity-25 cursor-not-allowed' : 'hover:text-blue-600'}" data-id="${entrega.id}" title="Mover para Cima" ${index === 0 ? 'disabled' : ''}>
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7" /></svg>
                            </button>
                            <button class="btn-mover-baixo text-gray-400 p-2 ${index === entregasOrdenadas.length - 1 ? 'opacity-25 cursor-not-allowed' : 'hover:text-blue-600'}" data-id="${entrega.id}" title="Mover para Baixo" ${index === entregasOrdenadas.length - 1 ? 'disabled' : ''}>
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" /></svg>
                            </button>
                        </div>
                    `;

                    // Lógica de Cestas (Multi-Cesta)
                    const cestasParaRenderizar = migrarFormatoCestas(entrega);
                    let infoCestasHtml = '';
                    let valorTotalEntrega = 0;
                    
                    cestasParaRenderizar.forEach(cesta => {
                        const valorCestaTotal = cesta.valor * cesta.quantidade;
                        valorTotalEntrega += valorCestaTotal;
                        
                        let tagsCesta = '';
                        // MODIFICADO: Lógica da tag Brinde
                        if (cesta.brinde === 'Sim') {
                            const brindesTxt = (cesta.brindeOpcoes && cesta.brindeOpcoes.length > 0) ? cesta.brindeOpcoes.join(', ') : 'Sim';
                            tagsCesta += `<span class="text-xs font-semibold bg-pink-100 text-pink-800 px-2 py-0.5 rounded-full">Brinde: ${brindesTxt}</span>`;
                        }
                        if (cesta.tipo === 'Alterada') tagsCesta += `<span class="text-xs font-semibold bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">Cesta: Alterada</span>`;
                        if (cesta.codigoFinal) tagsCesta += `<span class="text-xs font-semibold bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">Final: ${cesta.codigoFinal}</span>`;
                        if (cesta.partesAlteradas && cesta.partesAlteradas.length > 0) tagsCesta += `<span class="text-xs font-semibold bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">Partes: ${cesta.partesAlteradas.join(', ')}</span>`;
                        
                        let detalhesCestaHtml = '';
                        if (cesta.tipo === 'Alterada' && cesta.codigoAlterada) {
                             detalhesCestaHtml = `
                                <div class="mt-2 pt-2 border-t border-gray-200">
                                    <span class="text-xs font-bold text-yellow-700">DETALHES:</span>
                                    <p class="pre-wrap-texto text-yellow-700">${cesta.codigoAlterada}</p>
                                </div>
                            `;
                        }

                        infoCestasHtml += `
                            <div class="p-2 bg-gray-50 rounded-md border border-gray-300">
                                <div class="flex justify-between items-center">
                                    <span class="text-sm font-semibold text-gray-800">${cesta.quantidade}x ${cesta.nome}</span>
                                    <span class="text-sm font-semibold text-gray-800">${formatarMoeda(valorCestaTotal)}</span>
                                </div>
                                <div class="mt-1 flex flex-wrap gap-1">
                                    ${tagsCesta}
                                </div>
                                ${detalhesCestaHtml}
                            </div>
                        `;
                    });

                    // Botões de Ação (Editar, Cancelar, Entregar, Montar)
                    let botoesAcaoHtml = '';
                    // CORREÇÃO: Botão Editar agora é 'admin-view'
                    const btnEditarHtml = `
                        <button class="btn-editar-entrega admin-view w-full rounded-md px-4 py-3 text-sm font-medium shadow-sm bg-yellow-100 text-yellow-700 border border-yellow-300 hover:bg-yellow-200 flex justify-center items-center col-span-1" data-id="${entrega.id}" title="Editar Pedido">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                            Editar
                        </button>`;
                    
                    if (entrega.status === 'Pendente') {
                        botoesAcaoHtml = `
                            ${btnEditarHtml}
                            <button class="btn-cancelar-entrega admin-view w-full rounded-md px-4 py-3 text-sm font-medium shadow-sm bg-red-100 text-red-700 border border-red-300 hover:bg-red-200 col-span-1" data-id="${entrega.id}">
                                Cancelar
                            </button>
                            <button class="btn-entregue entregador-view w-full rounded-md px-4 py-3 text-sm font-medium shadow-sm bg-white text-gray-700 border border-gray-400 hover:bg-gray-50 col-span-2" data-id="${entrega.id}">
                                Marcar Entrega
                            </button>
                            <button class="btn-montado montador-view w-full rounded-md px-4 py-3 text-sm font-medium shadow-sm bg-white text-blue-700 border border-gray-400 hover:bg-gray-50 col-span-2" data-id="${entrega.id}">
                                Marcar como Montado
                            </button>
                        `;
                    } else if (entrega.status === 'Montado') {
                         botoesAcaoHtml = `
                            ${btnEditarHtml}
                            <button class="btn-cancelar-entrega admin-view w-full rounded-md px-4 py-3 text-sm font-medium shadow-sm bg-red-100 text-red-700 border border-red-300 hover:bg-red-200 col-span-1" data-id="${entrega.id}">
                                Cancelar
                            </button>
                            <button class="btn-entregue entregador-view w-full rounded-md px-4 py-3 text-sm font-medium shadow-sm bg-white text-gray-700 border border-gray-400 hover:bg-gray-50 col-span-2" data-id="${entrega.id}">
                                Marcar Entrega
                            </button>
                            <button class="btn-montado montador-view w-full rounded-md px-4 py-3 text-sm font-medium shadow-sm bg-blue-600 text-white cursor-not-allowed col-span-2" data-id="${entrega.id}" disabled>
                                Montado
                            </button>
                         `;
                    } else if (entrega.status === 'Entregue') {
                        botoesAcaoHtml = `<button class="btn-entregue w-full rounded-md px-4 py-3 text-sm font-medium shadow-sm bg-green-600 text-white cursor-not-allowed col-span-2" disabled>Entregue</button>`;
                    } else {
                        botoesAcaoHtml = `<button class="btn-entregue w-full rounded-md px-4 py-3 text-sm font-medium shadow-sm bg-gray-500 text-white cursor-not-allowed col-span-2" disabled>Cancelada</button>`;
                    }

                    card.innerHTML = `
                        <!-- Seção 1: Cliente e Setas (Admin) -->
                        <div class="flex justify-between items-start">
                            ${infoClienteHtml}
                        </div>
                        
                        <!-- Seção 2: Cestas e Valor Total -->
                        <div class="mt-4 space-y-2">
                            ${infoCestasHtml}
                        </div>
                        <div class="flex justify-end items-center mt-2 p-2 bg-gray-100 rounded-md">
                            <span class="text-sm font-medium text-gray-600 mr-2">VALOR TOTAL:</span>
                            <span class="text-lg font-bold text-gray-900">${formatarMoeda(valorTotalEntrega)}</span>
                        </div>

                        <!-- Blocos de Info (Obs, Detalhes, Status) -->
                        <div class="mt-2 space-y-2 overflow-hidden">
                            ${statusInfo}
                        </div>
                        
                        <!-- Barra de Ações (Ícones) -->
                        <div class="montador-hidden grid grid-cols-5 gap-1 mt-4 pt-4 border-t border-gray-200">
                            <!-- Mapa -->
                            <button class="btn-card-maps flex flex-col items-center justify-center p-2 text-gray-600 hover:bg-gray-100 rounded-md ${entrega.status === 'Pendente' || entrega.status === 'Montado' ? '' : 'opacity-50 cursor-not-allowed'}" ${entrega.status === 'Pendente' || entrega.status === 'Montado' ? '' : 'disabled'}>
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd" /></svg>
                                <span class="text-xs mt-1">Mapa</span>
                            </button>
                            <!-- WhatsApp -->
                            <button class="btn-card-whatsapp flex flex-col items-center justify-center p-2 text-gray-600 hover:bg-gray-100 rounded-md ${entrega.cliente.celular ? '' : 'opacity-50 cursor-not-allowed'}" ${entrega.cliente.celular ? '' : 'disabled'} data-id="${entrega.id}">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="currentColor" viewBox="0 0 16 16"><path d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.626-2.957 6.584-6.591 6.584zm3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.068-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.1-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.05-.087-.182-.133-.38-.232z"/></svg>
                                <span class="text-xs mt-1">Wpp</span>
                            </button>
                            <!-- Ligar -->
                            <button class="btn-card-ligar flex flex-col items-center justify-center p-2 text-gray-600 hover:bg-gray-100 rounded-md ${entrega.cliente.celular ? '' : 'opacity-50 cursor-not-allowed'}" ${entrega.cliente.celular ? '' : 'disabled'}>
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C6.477 18 2 13.523 2 8V3z" /></svg>
                                <span class="text-xs mt-1">Ligar</span>
                            </button>
                            <!-- Exportar Card -->
                            <button class="btn-card-exportar flex flex-col items-center justify-center p-2 text-gray-600 hover:bg-gray-100 rounded-md" data-id="${entrega.id}">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                <span class="text-xs mt-1">JSON</span>
                            </button>
                        </div>

                        <!-- Botões de Ação (Abaixo dos Ícones) -->
                        <div class="grid grid-cols-2 gap-2 mt-2">
                            ${botoesAcaoHtml}
                        </div>
                    `;
                    listaEntregasEl.appendChild(card);
                });
            }

            function renderizarResumo() {
                const entregas = getEntregasAtivas();
                let totalCestas = 0;
                let cestasBreakdown = {};
                let rotasBreakdown = {};
                let pedidosRotaBreakdown = {};

                entregas.forEach(entrega => {
                    if (entrega.status === 'Cancelada') return;

                    const rotaPedido = entrega.rotaEntrega || 'N/A';
                    pedidosRotaBreakdown[rotaPedido] = (pedidosRotaBreakdown[rotaPedido] || 0) + 1;
                    
                    const cestas = migrarFormatoCestas(entrega);
                    cestas.forEach(cesta => {
                        totalCestas += cesta.quantidade;
                        cestasBreakdown[cesta.nome] = (cestasBreakdown[cesta.nome] || 0) + cesta.quantidade;
                        rotasBreakdown[rotaPedido] = (rotasBreakdown[rotaPedido] || 0) + cesta.quantidade;
                    });
                });

                summaryTotalPedidos.textContent = entregas.filter(e => e.status !== 'Cancelada').length;
                summaryTotalCestas.textContent = totalCestas;
                summaryCestasBreakdown.innerHTML = Object.entries(cestasBreakdown).map(([n, q]) => `${n}: <strong>${q}</strong>`).join('<br>') || 'N/A';
                summaryRotasBreakdown.innerHTML = Object.entries(rotasBreakdown).map(([r, q]) => `${r}: <strong>${q}</strong>`).join('<br>') || 'N/A';
            }
            
            // --- Funções de Lógica do Formulário (Adicionar/Editar) ---

            function toggleSubCampoAlterada() {
                const tipo = document.querySelector('input[name="sub-tipo-cesta"]:checked').value;
                if (tipo === 'Alterada') {
                    subCampoAlterada.classList.remove('hidden');
                } else {
                    subCampoAlterada.classList.add('hidden');
                }
            }
            function toggleSubCampoBrinde() {
                const brinde = document.querySelector('input[name="sub-brinde"]:checked').value;
                if (brinde === 'Sim') {
                    subCampoBrinde.classList.remove('hidden');
                } else {
                    subCampoBrinde.classList.add('hidden');
                }
            }
            
            function adicionarCestaAoPedido() {
                const selectedOption = subSelectCesta.options[subSelectCesta.selectedIndex];
                const partesAlteradas = 
                    Array.from(document.querySelectorAll('input[name="sub-partes_alteradas"]:checked'))
                         .map(input => input.value);
                // MODIFICADO: Captura Brindes
                const brindeOpcoes = 
                    Array.from(document.querySelectorAll('input[name="sub-brinde-opcoes"]:checked'))
                         .map(input => input.value);

                const novaCesta = {
                    nome: selectedOption.value,
                    valor: parseFloat(selectedOption.dataset.valor),
                    quantidade: parseInt(subInputQuantidade.value) || 1,
                    tipo: document.querySelector('input[name="sub-tipo-cesta"]:checked').value,
                    brinde: document.querySelector('input[name="sub-brinde"]:checked').value,
                    brindeOpcoes: brindeOpcoes, // NOVO
                    brindeDescricao: '', // REMOVIDO: brindeOpcoes substitui
                    codigoAlterada: subCodigoAlterada.value || '',
                    codigoFinal: subCodigoFinal.value || '',
                    partesAlteradas: partesAlteradas
                };
                
                cestasDoPedidoAtual.push(novaCesta);
                resetarSubFormulario();
                renderCestasNoPedido();
            }

            function resetarSubFormulario() {
                subSelectCesta.selectedIndex = 0;
                subInputQuantidade.value = 1;
                document.querySelector('input[name="sub-tipo-cesta"][value="Normal"]').checked = true;
                document.querySelector('input[name="sub-brinde"][value="Não"]').checked = true;
                // MODIFICADO: Reseta Checkboxes de Brinde
                document.querySelectorAll('input[name="sub-brinde-opcoes"]:checked').forEach(cb => cb.checked = false);
                subCodigoAlterada.value = '';
                subCodigoFinal.value = '';
                document.querySelectorAll('input[name="sub-partes_alteradas"]:checked').forEach(cb => cb.checked = false);
                toggleSubCampoAlterada();
                toggleSubCampoBrinde();
            }
            
            function renderCestasNoPedido() {
                listaCestasNoPedidoEl.innerHTML = '';
                let valorTotal = 0;

                if (cestasDoPedidoAtual.length === 0) {
                    listaCestasVaziaEl.classList.remove('hidden');
                    displayValorTotal.textContent = formatarMoeda(0);
                    return;
                }
                
                listaCestasVaziaEl.classList.add('hidden');
                
                cestasDoPedidoAtual.forEach((cesta, index) => {
                    const valorCestaTotal = cesta.valor * cesta.quantidade;
                    valorTotal += valorCestaTotal;

                    const item = document.createElement('div');
                    item.className = 'p-3 bg-white rounded-md border border-gray-300 flex justify-between items-center';
                    item.innerHTML = `
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-semibold text-gray-800">${cesta.quantidade}x ${cesta.nome}</p>
                            <p class="text-xs text-gray-600">${cesta.tipo} ${cesta.brinde === 'Sim' ? '| Com Brinde' : ''}</p>
                        </div>
                        <div class="flex-shrink-0 flex items-center gap-4">
                            <span class="text-sm font-semibold text-gray-800">${formatarMoeda(valorCestaTotal)}</span>
                            <button type="button" data-index="${index}" class="btn-remover-cesta text-red-500 hover:text-red-700">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1zm2 3a1 1 0 100 2h2a1 1 0 100-2H9z" clip-rule="evenodd" /></svg>
                            </button>
                        </div>
                    `;
                    listaCestasNoPedidoEl.appendChild(item);
                });

                displayValorTotal.textContent = formatarMoeda(valorTotal);
            }
            
            function removerCestaDoPedido(index) {
                cestasDoPedidoAtual.splice(index, 1);
                renderCestasNoPedido();
            }

            function adicionarOuAtualizarEntrega(e) {
                e.preventDefault();
                
                const rotaAtiva = getRotaAtiva();
                if (!rotaAtiva) {
                    mostrarAviso("Nenhuma rota ativa selecionada. Crie uma nova rota.");
                    return;
                }
                const entregas = rotaAtiva.entregas;

                const nomeClienteSelecionado = inputCliente.value;
                // CORREÇÃO: Usar normalizarString para buscar no cache
                const clienteSelecionado = CLIENTES_CACHE[normalizarString(nomeClienteSelecionado)];
                let clienteData;
                if (clienteSelecionado) {
                    clienteData = clienteSelecionado;
                } else {
                    clienteData = { nome: nomeClienteSelecionado, celular: '', endereco: nomeClienteSelecionado, complemento: '' };
                }

                if (!clienteData.nome) {
                    mostrarAviso('Por favor, selecione ou digite um nome de cliente.');
                    return;
                }
                if (cestasDoPedidoAtual.length === 0) {
                    mostrarAviso('É preciso adicionar ao menos uma cesta ao pedido.');
                    return;
                }

                const dadosEntrega = {
                    cliente: clienteData,
                    observacao: obsClienteInput.value,
                    rotaEntrega: selectRotaEntrega.value,
                    cestas: cestasDoPedidoAtual // Salva o "carrinho"
                };

                if (editingEntregaId) {
                    // MODO EDIÇÃO
                    const index = entregas.findIndex(e => e.id.toString() === editingEntregaId.toString());
                    if (index !== -1) {
                        const entregaOriginal = entregas[index];
                        entregas[index] = {
                            ...entregaOriginal, // Mantém id, status, formaPagamento, horario, etc.
                            ...dadosEntrega      // Sobrescreve com os dados do form
                        };
                        
                        // Limpa campos antigos legados
                        delete entregas[index].cesta; delete entregas[index].quantidade;
                        delete entregas[index].tipo; delete entregas[index].brinde;
                        delete entregas[index].brindeDescricao; delete entregas[index].brindeOpcoes; // Limpa o legado (agora está dentro de 'cestas')
                        delete entregas[index].codigoAlterada;
                        delete entregas[index].partesAlteradas;
                        delete entregas[index].codigoFinal;
                        
                        mostrarAviso("Entrega atualizada com sucesso!");
                    } else {
                        mostrarAviso("Erro: Não foi possível encontrar a entrega para atualizar.");
                    }
                } else {
                    // MODO NOVA ENTREGA
                    const novaEntrega = {
                        ...dadosEntrega,
                        id: Date.now(),
                        status: "Pendente",
                        formaPagamento: [],
                        horarioEntrega: null,
                        horarioMontagem: null
                    };
                    entregas.push(novaEntrega);
                }
                
                salvarTodasAsRotas();
                
                // CORREÇÃO: Reseta o filtro para a rota do pedido que acabou de ser salvo/editado
                resetarFiltroParaPadrao(dadosEntrega.rotaEntrega); 
                
                renderizarEntregas();
                renderizarResumo();
                sairModoEdicao(); // Reseta e fecha o modal
            }

            function entrarModoEdicao(id) {
                const entregas = getEntregasAtivas();
                const entrega = entregas.find(e => e.id.toString() === id);
                if (!entrega) return;
                
                editingEntregaId = id;
                
                // Popula o formulário
                inputCliente.value = entrega.cliente.nome;
                inputCliente.dispatchEvent(new Event('input')); // Simula input para mostrar info
                obsClienteInput.value = entrega.observacao || '';
                selectRotaEntrega.value = entrega.rotaEntrega || 'CUIABÁ';

                // Popula o "carrinho" (cestasDoPedidoAtual)
                cestasDoPedidoAtual = migrarFormatoCestas(entrega);
                renderCestasNoPedido();
                
                // Muda UI do Formulário
                modalFormTitle.textContent = "Editar Entrega";
                btnSubmitFormText.textContent = "Atualizar Entrega";
                
                abrirFormModal();
            }

            function sairModoEdicao() {
                editingEntregaId = null;
                cestasDoPedidoAtual = []; // Esvazia o carrinho
                formEntrega.reset();
                
                // Reseta manualmente os campos que o reset() não pega
                inputCliente.value = '';
                inputCliente.dispatchEvent(new Event('input'));
                selectRotaEntrega.value = 'CUIABÁ';
                obsClienteInput.value = '';
                
                resetarSubFormulario();
                renderCestasNoPedido();

                // Muda UI do Formulário
                modalFormTitle.textContent = "Lançar Nova Entrega";
                btnSubmitFormText.textContent = "Lançar Entrega";
                
                fecharFormModal();
            }

            // --- Funções de Ação nos Cards ---

            function moverEntrega(id, direcao) {
                const entregas = getEntregasAtivas();
                const index = entregas.findIndex(e => e.id.toString() === id);
                if (index === -1) return;

                if (direcao === 'cima' && index > 0) {
                    [entregas[index - 1], entregas[index]] = [entregas[index], entregas[index - 1]];
                } else if (direcao === 'baixo' && index < entregas.length - 1) {
                    [entregas[index + 1], entregas[index]] = [entregas[index], entregas[index + 1]];
                } else {
                    return;
                }
                salvarTodasAsRotas();
                renderizarEntregas(); // Re-renderiza para atualizar as setas
            }
            
            function cancelarEntrega(id) {
                const entregas = getEntregasAtivas();
                const index = entregas.findIndex(e => e.id.toString() === id);
                if (index !== -1) {
                    entregas[index].status = "Cancelada";
                    entregas[index].formaPagamento = [];
                    entregas[index].horarioEntrega = new Date().toISOString();
                }
                salvarTodasAsRotas();
                renderizarEntregas();
                renderizarResumo();
            }

            function marcarComoMontado(id) {
                const entregas = getEntregasAtivas();
                const index = entregas.findIndex(e => e.id.toString() === id);
                if (index !== -1) {
                    entregas[index].status = "Montado";
                    entregas[index].horarioMontagem = new Date().toISOString();
                }
                salvarTodasAsRotas();
                renderizarEntregas();
                renderizarResumo();
            }

            function abrirModalPagamento(id) {
                const entregas = getEntregasAtivas();
                const entrega = entregas.find(e => e.id.toString() === id);
                if (!entrega) return;

                entregaParaPagarId = id;
                
                // Calcula o valor total (multi-cesta)
                const cestas = migrarFormatoCestas(entrega);
                const valorTotal = cestas.reduce((total, cesta) => total + (cesta.valor * cesta.quantidade), 0);
                
                modalClienteNome.textContent = entrega.cliente.nome;
                modalClienteValor.textContent = formatarMoeda(valorTotal);
                
                formPagamento.reset();
                modalErrorPagamento.classList.add('hidden');
                modalPagamento.classList.remove('hidden');
            }

            function salvarPagamento(e) {
                e.preventDefault();
                const formasPagamentoSelecionadas = 
                    Array.from(formPagamento.querySelectorAll('input[name="forma_pagamento"]:checked'))
                         .map(input => input.value);
                
                if (formasPagamentoSelecionadas.length === 0) {
                    modalErrorPagamento.classList.remove('hidden');
                    return;
                }
                
                const entregas = getEntregasAtivas();
                const index = entregas.findIndex(e => e.id.toString() === entregaParaPagarId);
                if (index !== -1) {
                    entregas[index].status = "Entregue";
                    entregas[index].formaPagamento = formasPagamentoSelecionadas;
                    entregas[index].horarioEntrega = new Date().toISOString();
                }
                
                salvarTodasAsRotas();
                renderizarEntregas();
                renderizarResumo();
                modalPagamento.classList.add('hidden');
                entregaParaPagarId = null;
            }

            function handleCardClick(e) {
                // Ações do Card (Delegação de Evento)
                const id = e.target.closest('[data-id]')?.dataset.id;
                if (!id) return;

                const entregas = getEntregasAtivas();
                const entrega = entregas.find(e => e.id.toString() === id);
                if (!entrega) return;

                // Mover Cima
                if (e.target.closest('.btn-mover-cima')) {
                    moverEntrega(id, 'cima'); return;
                }
                // Mover Baixo
                if (e.target.closest('.btn-mover-baixo')) {
                    moverEntrega(id, 'baixo'); return;
                }
                // Cancelar
                if (e.target.closest('.btn-cancelar-entrega')) {
                    cancelarEntrega(id); return;
                }
                // Editar
                if (e.target.closest('.btn-editar-entrega')) {
                    entrarModoEdicao(id); return;
                }
                // Marcar Montado
                if (e.target.closest('.btn-montado')) {
                    marcarComoMontado(id); return;
                }
                // Marcar Entregue
                if (e.target.closest('.btn-entregue')) {
                    abrirModalPagamento(id); return;
                }
                // Mapa
                if (e.target.closest('.btn-card-maps')) {
                    abrirGoogleMaps(entrega.cliente.endereco); return;
                }
                // Ligar
                if (e.target.closest('.btn-card-ligar')) {
                    const tel = (entrega.cliente.celular || '').replace(/\D/g, '');
                    if (tel) window.open(`tel:${tel}`);
                    return;
                }
                // WhatsApp
                if (e.target.closest('.btn-card-whatsapp')) {
                    whatsAppEntregaId = id;
                    modalWppClienteNome.textContent = entrega.cliente.nome;
                    modalWhatsApp.classList.remove('hidden');
                    return;
                }
                // Exportar Card
                if (e.target.closest('.btn-card-exportar')) {
                    exportarCardComoJson(id); return;
                }
            }

            // --- Funções de Ação do WhatsApp ---

            function handleAcaoWhatsApp(e) {
                const acao = e.target.closest('.btn-acao-wpp')?.dataset.acao;
                if (!acao || !whatsAppEntregaId) return;

                const entregas = getEntregasAtivas();
                const entrega = entregas.find(e => e.id.toString() === whatsAppEntregaId);
                if (!entrega) return;

                const tel = (entrega.cliente.celular || '').replace(/\D/g, '');
                const nomeCliente = entrega.cliente.nome.split(' ')[0]; // Primeiro nome
                
                // Calcula o valor total (multi-cesta)
                const cestas = migrarFormatoCestas(entrega);
                const valorTotal = cestas.reduce((total, cesta) => total + (cesta.valor * cesta.quantidade), 0);

                let texto = "";
                let numeroDestino = tel; // Padrão é o cliente

                switch (acao) {
                    case 'avisar-chegando':
                        texto = `Olá ${nomeCliente}! Sou o entregador da sua Cesta Básica. Estou chegando ao seu endereço em alguns minutos. Por favor, confirme que há alguém no local para receber. Obrigado!`;
                        break;
                    case 'avisar-na-porta':
                        texto = `Olá ${nomeCliente}, bom dia! O entregador da sua Cesta Básica já está na porta da sua casa aguardando. Obrigado!`;
                        break;
                    case 'agradecer':
                        texto = `Obrigado ${nomeCliente} pela compra. Esperamos você no proximo mês!`;
                        break;
                    case 'enviar-pix':
                        texto = `Olá ${nomeCliente}! O valor total do seu pedido é ${formatarMoeda(valorTotal)}. \n\nNossa chave Pix é:\n${CHAVE_PIX_PADRAO}\n\nPor favor, envie o comprovante. Obrigado!`;
                        break;
                    case 'compartilhar-admin':
                        numeroDestino = ADMIN_WHATSAPP_NUMBER;
                        texto = gerarResumoPedido(entrega, valorTotal);
                        break;
                }

                if (numeroDestino) {
                    const url = `https://api.whatsapp.com/send?phone=55${numeroDestino}&text=${encodeURIComponent(texto)}`;
                    window.open(url, '_blank');
                } else {
                    mostrarAviso("Este cliente não possui um número de celular cadastrado.");
                }

                modalWhatsApp.classList.add('hidden');
                whatsAppEntregaId = null;
            }

            function gerarResumoPedido(entrega, valorTotal) {
                let resumo = `*PEDIDO CLIENTE: ${entrega.cliente.nome}*\n\n`;
                resumo += `*Endereço:* ${entrega.cliente.endereco || 'N/A'}\n`;
                resumo += `*Complemento:* ${entrega.cliente.complemento || 'N/A'}\n`;
                resumo += `*Celular:* ${entrega.cliente.celular || 'N/A'}\n`;
                resumo += `*Rota:* ${entrega.rotaEntrega || 'N/A'}\n\n`;
                
                if (entrega.observacao) {
                    resumo += `*OBSERVAÇÃO (GERAL):*\n${entrega.observacao}\n\n`;
                }

                resumo += `*--- CESTAS NO PEDIDO ---*\n`;
                const cestas = migrarFormatoCestas(entrega);
                cestas.forEach(cesta => {
                    resumo += `*${cesta.quantidade}x ${cesta.nome}* (${formatarMoeda(cesta.valor * cesta.quantidade)})\n`;
                    // MODIFICADO: Lógica de Brinde
                    if (cesta.brinde === 'Sim') {
                        const brindesTxt = (cesta.brindeOpcoes && cesta.brindeOpcoes.length > 0) ? cesta.brindeOpcoes.join(', ') : 'Sim';
                        resumo += `  - Brinde: ${brindesTxt}\n`;
                    }
                    if (cesta.tipo === 'Alterada') {
                        resumo += `  - Cesta: Alterada\n`;
                        if (cesta.codigoFinal) resumo += `  - Final: ${cesta.codigoFinal}\n`;
                        if (cesta.partesAlteradas && cesta.partesAlteradas.length > 0) resumo += `  - Partes: ${cesta.partesAlteradas.join(', ')}\n`;
                        if (cesta.codigoAlterada) resumo += `  - Detalhes: ${cesta.codigoAlterada}\n`;
                    }
                });

                resumo += `\n*VALOR TOTAL: ${formatarMoeda(valorTotal)}*`;
                return resumo;
            }

            function abrirGoogleMaps(query) {
                if (!query) {
                    mostrarAviso('O cliente não possui um código ou endereço para abrir no mapa.');
                    return;
                }
                const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
                window.open(url, '_blank');
            }

            // --- Funções de Importar/Exportar ---
            
            async function compartilharOuBaixar(blob, nomeArquivo) {
                const data = {
                    files: [new File([blob], nomeArquivo, { type: 'application/json' })],
                    title: 'Rota de Entrega',
                    text: `Backup da rota ${nomeArquivo}`,
                };
                
                try {
                    // Tenta usar a API de Compartilhamento (Mobile)
                    if (navigator.canShare && navigator.canShare(data)) {
                        await navigator.share(data);
                    } else {
                        // Fallback para Download (Desktop)
                        throw new Error('API de compartilhamento não suportada.');
                    }
                } catch (err) {
                    // Fallback para Download (Desktop)
                    const a = document.createElement('a');
                    const url = URL.createObjectURL(blob);
                    a.href = url;
                    a.download = nomeArquivo;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }
            }
            
            // MODIFICADO: Apenas abre o modal
            function exportarDados() {
                const rotaAtiva = getRotaAtiva();
                if (!rotaAtiva || rotaAtiva.entregas.length === 0) {
                    mostrarAviso("Nenhuma entrega na rota ativa para exportar.");
                    return;
                }
                
                // Prepara Relatório de Entregas Concluídas (para o <pre>)
                const entregasConcluidas = rotaAtiva.entregas.filter(e => e.status === 'Entregue');
                const entregasCanceladas = rotaAtiva.entregas.filter(e => e.status === 'Cancelada');
                let relatorioTexto = "Nenhuma entrega finalizada.\n";

                if (entregasConcluidas.length > 0 || entregasCanceladas.length > 0) {
                    relatorioTexto = "";
                }
                if (entregasConcluidas.length > 0) {
                    relatorioTexto += "--- RELATÓRIO DE ENTREGAS ---\n\n";
                    entregasConcluidas.forEach(e => {
                        const cestas = migrarFormatoCestas(e);
                        const valorTotal = cestas.reduce((total, cesta) => total + (cesta.valor * cesta.quantidade), 0);
                        relatorioTexto += `Cliente: ${e.cliente.nome}\n`;
                        relatorioTexto += `Valor: ${formatarMoeda(valorTotal)}\n`;
                        relatorioTexto += `Pagamento: ${e.formaPagamento.join(', ')}\n`;
                        relatorioTexto += `Horário: ${formatarData(e.horarioEntrega)}\n`;
                        relatorioTexto += `-----------------------------\n`;
                    });
                }
                if (entregasCanceladas.length > 0) {
                    relatorioTexto += "\n--- ENTREGAS CANCELADAS ---\n\n";
                    entregasCanceladas.forEach(e => {
                        relatorioTexto += `Cliente: ${e.cliente.nome}\n`;
                        relatorioTexto += `Horário: ${formatarData(e.horarioEntrega)}\n`;
                        relatorioTexto += `-----------------------------\n`;
                    });
                }
                exportRelatorioEl.querySelector('pre').textContent = relatorioTexto;

                // Limpa o link WPP antigo e reseta o seletor
                exportWhatsappLinkEl.innerHTML = `
                    <button type="button" id="btn-gerar-resumo-wpp" class="inline-flex items-center justify-center w-full rounded-md border border-transparent bg-green-500 px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-green-600">
                        Gerar Resumo WhatsApp
                    </button>`;
                exportWppError.classList.add('hidden');
                document.querySelectorAll('input[name="export-rota-wpp"]:checked').forEach(cb => cb.checked = false);
                
                // Adiciona o listener ao botão (precisa ser aqui, pois o botão é recriado)
                document.getElementById('btn-gerar-resumo-wpp').addEventListener('click', gerarResumoWhatsApp);

                modalExportar.classList.remove('hidden');
            }

            // MODIFICADO: Nova função para gerar o resumo WPP
            function gerarResumoWhatsApp() {
                const rotaAtiva = getRotaAtiva();
                const rotasSelecionadas = 
                    Array.from(document.querySelectorAll('input[name="export-rota-wpp"]:checked'))
                         .map(input => input.value);
                
                if (rotasSelecionadas.length === 0) {
                    exportWppError.classList.remove('hidden');
                    return;
                }
                exportWppError.classList.add('hidden');

                let whatsappTexto = `*Resumo da Rota: ${rotaAtiva.nome}* (${new Date(rotaAtiva.data + 'T12:00:00').toLocaleDateString('pt-BR')})\n\n`;

                // Filtra entregas pendentes pelas rotas selecionadas
                const entregasPendentes = rotaAtiva.entregas.filter(e => 
                    (e.status === 'Pendente' || e.status === 'Montado') && 
                    rotasSelecionadas.includes(e.rotaEntrega)
                );

                whatsappTexto += `*Entregas Pendentes (${entregasPendentes.length})*:\n`;
                if(entregasPendentes.length > 0) {
                    entregasPendentes.forEach((e, index) => {
                        whatsappTexto += `${index + 1}. *${e.cliente.nome}* (${e.rotaEntrega})\n`;
                        // ... (gerar resumo do pedido)
                    });
                } else {
                    whatsappTexto += `Nenhuma entrega pendente para as rotas selecionadas.\n`;
                }
                
                // Relatório Financeiro (AGORA CONSIDERA APENAS ROTAS SELECIONADAS)
                const entregasConcluidas = rotaAtiva.entregas.filter(e => 
                    e.status === 'Entregue' && 
                    rotasSelecionadas.includes(e.rotaEntrega)
                );

                let totalVendido = 0;
                let totalPorPagamento = {};
                entregasConcluidas.forEach(e => {
                    const cestas = migrarFormatoCestas(e);
                    const valorTotal = cestas.reduce((total, cesta) => total + (cesta.valor * cesta.quantidade), 0);
                    totalVendido += valorTotal;
                    
                    if (e.formaPagamento.length === 0) {
                         totalPorPagamento['N/A'] = (totalPorPagamento['N/A'] || 0) + valorTotal;
                    } else {
                        const valorDividido = valorTotal / e.formaPagamento.length;
                        e.formaPagamento.forEach(forma => {
                            totalPorPagamento[forma] = (totalPorPagamento[forma] || 0) + valorDividido;
                        });
                    }
                });

                whatsappTexto += `\n\n--- RELATÓRIO FINANCEIRO (Rotas: ${rotasSelecionadas.join(', ')}) ---\n`;
                whatsappTexto += `*Vendas Concluídas:*\n`;
                whatsappTexto += `Total Vendido: *${formatarMoeda(totalVendido)}*\n`;
                
                whatsappTexto += `\n*Recebimentos por Forma:*\n`;
                if(Object.keys(totalPorPagamento).length > 0) {
                    Object.keys(totalPorPagamento).forEach(forma => {
                        whatsappTexto += `   ${forma}: ${formatarMoeda(totalPorPagamento[forma])}\n`;
                    });
                } else {
                    whatsappTexto += 'Nenhum recebimento.\n';
                }

                // Despesas (Despesas são da rota inteira, não por sub-rota)
                const despesas = rotaAtiva.despesas;
                const totalDespesas = (despesas.abastecimento || 0) + (despesas.alimentacao || 0) + (despesas.extra || 0);
                whatsappTexto += `\n*Despesas da Rota (Total):*\n`;
                whatsappTexto += `   Abastecimento: ${formatarMoeda(despesas.abastecimento || 0)}\n`;
                whatsappTexto += `   Alimentação: ${formatarMoeda(despesas.alimentacao || 0)}\n`;
                whatsappTexto += `   Extras: ${formatarMoeda(despesas.extra || 0)}\n`;
                whatsappTexto += `Total Despesas: *${formatarMoeda(totalDespesas)}*\n`;
                
                const balanco = totalVendido - totalDespesas;
                whatsappTexto += `\n*BALANÇO (Vendido ${rotasSelecionadas.join(', ')} - Despesas Totais):* *${formatarMoeda(balanco)}*\n`;
                
                const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(whatsappTexto)}`;
                
                // Substitui o botão "Gerar" pelo link
                exportWhatsappLinkEl.innerHTML = `
                    <a href="${whatsappUrl}" target="_blank" class="inline-flex items-center justify-center w-full rounded-md border border-transparent bg-green-500 px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-green-600">
                        Enviar Resumo no WhatsApp
                    </a>`;
            }
            
            async function exportarCardComoJson(id) {
                const entregas = getEntregasAtivas();
                const entrega = entregas.find(e => e.id.toString() === id);
                if (!entrega) return;
                
                const jsonDados = JSON.stringify(entrega, null, 2);
                const blob = new Blob([jsonDados], { type: 'application/json' });
                const nomeArquivo = `card_${entrega.cliente.nome.replace(/[^a-z0-9]/gi, '_')}.json`;
                
                await compartilharOuBaixar(blob, nomeArquivo);
            }

            function carregarDados(jsonDados) {
                try {
                    const dadosCarregados = JSON.parse(jsonDados);
                    
                    // Caso 1: É o formato NOVO (Objeto Rota)
                    if (typeof dadosCarregados === 'object' && !Array.isArray(dadosCarregados) && dadosCarregados.entregas) {
                        if (!dadosCarregados.id || !dadosCarregados.nome || !dadosCarregados.data) {
                            throw new Error('Objeto de rota inválido. Faltando id, nome ou data.');
                        }
                        let novoId = dadosCarregados.id;
                        if (todasAsRotas[novoId]) {
                            novoId = `import-${Date.now()}`;
                        }
                        dadosCarregados.id = novoId;
                        
                        // Garante que a rota importada tem os campos novos
                        dadosCarregados.despesas = dadosCarregados.despesas || { abastecimento: 0, alimentacao: 0, extra: 0 };
                        dadosCarregados.entregas = dadosCarregados.entregas.map(e => ({
                            ...e,
                            // Garante que o cliente é um objeto (compatibilidade com formato antigo)
                            cliente: typeof e.cliente === 'object' ? e.cliente : {
                                nome: e.codigoCliente || 'Cliente Antigo',
                                celular: '', endereco: e.codigoCliente || 'Sem Endereço', complemento: ''
                            },
                            rotaEntrega: e.rotaEntrega || 'CUIABÁ',
                            horarioMontagem: e.horarioMontagem || null
                        }));

                        todasAsRotas[novoId] = dadosCarregados;
                        rotaAtivaId = novoId;
                        
                        salvarTodasAsRotas();
                        popularSelectRotas();
                        carregarRotaAtiva();
                        
                    } 
                    // Caso 2: É o formato ANTIGO (Array de Entregas)
                    else if (Array.isArray(dadosCarregados)) {
                        const rotaAtiva = getRotaAtiva();
                        if (!rotaAtiva) {
                             mostrarAviso("Nenhuma rota ativa. Crie uma nova rota antes de carregar um arquivo antigo.");
                             return;
                        }
                        rotaAtiva.entregas = dadosCarregados.map(e => ({
                            ...e,
                            cliente: typeof e.cliente === 'object' ? e.cliente : {
                                nome: e.codigoCliente || 'Cliente Antigo',
                                celular: '', endereco: e.codigoCliente || 'Sem Endereço', complemento: ''
                            },
                            rotaEntrega: e.rotaEntrega || 'CUIABÁ',
                            horarioMontagem: e.horarioMontagem || null
                        }));
                        salvarTodasAsRotas();
                        renderizarEntregas();
                        renderizarResumo();
                    } else {
                        throw new Error('Formato de arquivo JSON desconhecido.');
                    }
                } catch (error) {
                    console.error("Erro ao carregar JSON:", error);
                    mostrarAviso(`Dados inválidos. Verifique o arquivo. (Erro: ${error.message})`);
                }
            }
            
            function handleCardImportado(e) {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const jsonCard = event.target.result;
                        const novaEntrega = JSON.parse(jsonCard);
                        
                        if (!novaEntrega.id || !novaEntrega.cliente || !novaEntrega.status) {
                             throw new Error('Este não parece ser um arquivo de card válido.');
                        }
                        
                        // Garante que a entrega importada tem os campos novos
                        novaEntrega.rotaEntrega = novaEntrega.rotaEntrega || 'CUIABÁ';
                        novaEntrega.horarioMontagem = novaEntrega.horarioMontagem || null;

                        const rotaAtiva = getRotaAtiva();
                        if (!rotaAtiva) {
                            mostrarAviso("Nenhuma rota ativa para adicionar o card.");
                            return;
                        }
                        
                        // Checa duplicidade
                        if (rotaAtiva.entregas.find(e => e.id === novaEntrega.id)) {
                            mostrarAviso("Este card de entrega (ID) já existe nesta rota.");
                            return;
                        }
                        
                        rotaAtiva.entregas.push(novaEntrega);
                        salvarTodasAsRotas();
                        
                        resetarFiltroParaPadrao(novaEntrega.rotaEntrega);
                        
                        renderizarEntregas();
                        renderizarResumo();
                        mostrarAviso("Card importado com sucesso!", "Sucesso");

                    } catch (error) {
                        mostrarAviso(`Erro ao processar o arquivo: ${error.message}`);
                    }
                };
                reader.readAsText(file);
                e.target.value = null;
            }
            
            function resetarFiltroParaPadrao(rotaDoPedido = null) {
                let filtroAlvo = rotaDoPedido || 'CUIABÁ';
                filtroRotaAtiva = filtroAlvo; 

                document.querySelectorAll('.btn-filtro-rota').forEach(btn => btn.classList.remove('btn-filtro-ativo'));
                
                const filtroAtivoBtn = document.querySelector(`.btn-filtro-rota[data-filtro="${filtroAlvo}"]`);
                if (filtroAtivoBtn) {
                    filtroAtivoBtn.classList.add('btn-filtro-ativo');
                } else {
                    const primeiroFiltro = document.querySelector('.btn-filtro-rota[data-filtro="CUIABÁ"]');
                    if (primeiroFiltro) {
                        primeiroFiltro.classList.add('btn-filtro-ativo');
                        filtroRotaAtiva = 'CUIABÁ';
                    }
                }
            }
            
            function atualizarFiltroRota(e) {
                const filtroBtn = e.target.closest('.btn-filtro-rota');
                if (!filtroBtn) return;
                
                filtroRotaAtiva = filtroBtn.dataset.filtro;
                
                document.querySelectorAll('.btn-filtro-rota').forEach(btn => btn.classList.remove('btn-filtro-ativo'));
                filtroBtn.classList.add('btn-filtro-ativo');
                
                renderizarEntregas();
            }

            // --- Inicialização e Event Listeners ---

            function iniciarAplicativo() {
                // 1. Carregar Clientes (do clientes.js)
                try {
                    if (typeof CLIENTES_DB !== 'undefined' && Array.isArray(CLIENTES_DB)) {
                        datalistClientes.innerHTML = '';
                        CLIENTES_DB.forEach(cliente => {
                            const option = document.createElement('option');
                            option.value = cliente.nome;
                            datalistClientes.appendChild(option);
                            CLIENTES_CACHE[normalizarString(cliente.nome)] = cliente;
                        });
                    } else {
                        console.error("CLIENTES_DB não encontrado. Verifique o 'clientes.js'.");
                        mostrarAviso("Erro ao carregar banco de dados de clientes. Verifique o 'clientes.js'.");
                    }
                } catch (e) {
                     console.error("Erro ao processar clientes:", e);
                     mostrarAviso("Erro ao processar o arquivo 'clientes.js'.");
                }
                
                // 2. Carregar Rotas
                const dadosSalvos = localStorage.getItem('gerenciadorDeRotas');
                if (dadosSalvos) {
                    todasAsRotas = JSON.parse(dadosSalvos);
                }
                
                // 3. Descobrir qual rota está ativa
                rotaAtivaId = localStorage.getItem('rotaAtivaId');

                // 4. Se não houver rotas, ou a rota ativa não existir, cria uma nova
                if (!rotaAtivaId || !todasAsRotas[rotaAtivaId]) {
                    if (Object.keys(todasAsRotas).length === 0) {
                        criarNovaRota(false);
                    } else {
                        rotaAtivaId = Object.keys(todasAsRotas)[0];
                        localStorage.setItem('rotaAtivaId', rotaAtivaId);
                    }
                }
                
                // 5. Define o modo inicial (ANTES de carregar a rota, para o FAB aparecer)
                setModoVisualizacao('admin');

                // 6. Popular o <select> e carregar a rota ativa na tela
                popularSelectRotas();
                carregarRotaAtiva();
                                
                // 7. Define o filtro inicial
                resetarFiltroParaPadrao(null); // Usa o padrão 'CUIABÁ'
            }

            // --- Adiciona todos os Event Listeners ---

            // Navegação (Modos)
            btnModoAdmin.addEventListener('click', () => setModoVisualizacao('admin'));
            btnModoEntregador.addEventListener('click', () => setModoVisualizacao('entregador'));
            btnModoMontador.addEventListener('click', () => setModoVisualizacao('montador'));
            btnTopAdmin.addEventListener('click', () => setModoVisualizacao('admin'));
            btnTopEntregador.addEventListener('click', () => setModoVisualizacao('entregador'));
            btnTopMontador.addEventListener('click', () => setModoVisualizacao('montador'));

            // Gerenciamento de Rota (Admin)
            selectRotaAtiva.addEventListener('change', (e) => {
                rotaAtivaId = e.target.value;
                localStorage.setItem('rotaAtivaId', rotaAtivaId);
                carregarRotaAtiva();
            });
            btnNovaRota.addEventListener('click', () => criarNovaRota(true));
            inputNomeRota.addEventListener('change', atualizarInfoRota);
            inputDataRota.addEventListener('change', atualizarInfoRota);
            btnExcluirRota.addEventListener('click', excluirRotaAtiva);

            // Despesas (Entregador)
            inputDespesaAbastecimento.addEventListener('change', salvarDespesas);
            inputDespesaAlimentacao.addEventListener('change', salvarDespesas);
            inputDespesaExtra.addEventListener('change', salvarDespesas);

            // Filtros de Rota
            filtrosRotaEl.addEventListener('click', atualizarFiltroRota);
            
            // Lista de Entregas (Delegação de Evento)
            listaEntregasEl.addEventListener('click', handleCardClick);

            // Modal Formulário
            btnAbrirFormModal.addEventListener('click', () => {
                sairModoEdicao(); // Garante que é um formulário novo
                abrirFormModal();
            });
            btnFecharFormModal.addEventListener('click', sairModoEdicao);
            formEntrega.addEventListener('submit', adicionarOuAtualizarEntrega);

            // Modal Formulário -> Cliente
            inputCliente.addEventListener('input', (e) => {
                const nome = e.target.value;
                // CORREÇÃO: Usar normalizarString para buscar no cache
                const cliente = CLIENTES_CACHE[normalizarString(nome)];
                if (cliente) {
                    displayClienteEndereco.textContent = cliente.endereco || '-';
                    displayClienteComplemento.textContent = cliente.complemento || '-';
                    displayClienteCelular.textContent = cliente.celular || '-';
                    infoClienteSelecionado.classList.remove('hidden');
                } else {
                    infoClienteSelecionado.classList.add('hidden');
                }
            });

            // Modal Formulário -> Sub-Formulário (Adicionar Cesta)
            btnAdicionarCesta.addEventListener('click', adicionarCestaAoPedido);
            document.querySelectorAll('input[name="sub-tipo-cesta"]').forEach(radio => {
                radio.addEventListener('change', toggleSubCampoAlterada);
            });
            document.querySelectorAll('input[name="sub-brinde"]').forEach(radio => {
                radio.addEventListener('change', toggleSubCampoBrinde);
            });
            listaCestasNoPedidoEl.addEventListener('click', (e) => {
                const btnRemover = e.target.closest('.btn-remover-cesta');
                if (btnRemover) {
                    removerCestaDoPedido(btnRemover.dataset.index);
                }
            });

            // Modal Pagamento
            btnCancelarPagamento.addEventListener('click', () => modalPagamento.classList.add('hidden'));
            formPagamento.addEventListener('submit', salvarPagamento);
            
            // Modal WhatsApp
            modalWhatsApp.addEventListener('click', handleAcaoWhatsApp);
            btnFecharWhatsApp.addEventListener('click', () => modalWhatsApp.classList.add('hidden'));
            
            /* MODIFICADO: Event listeners para querySelectorAll */
            btnsExportar.forEach(btn => btn.addEventListener('click', exportarDados));
            
            // Modal Exportar
            btnFecharExportar.addEventListener('click', () => modalExportar.classList.add('hidden'));
            btnBaixarJson.addEventListener('click', () => {
                const rotaAtiva = getRotaAtiva();
                if (!rotaAtiva) return;
                const jsonDados = JSON.stringify(rotaAtiva, null, 2);
                const blob = new Blob([jsonDados], { type: 'application/json' });
                const nomeArquivo = `rota_${rotaAtiva.nome.replace(/[^a-z0-9]/gi, '_')}_${rotaAtiva.data}.json`;
                compartilharOuBaixar(blob, nomeArquivo);
            });
            // NOVO: Listener para o botão de gerar resumo WPP
            btnGerarResumoWpp.addEventListener('click', gerarResumoWhatsApp);


            // Modal Aviso
            btnFecharAviso.addEventListener('click', fecharAviso);

            // Importação/Exportação de Arquivos
            /* MODIFICADO: Event listeners para querySelectorAll */
            btnsCarregar.forEach(btn => btn.addEventListener('click', () => inputCarregarArquivo.click()));
            inputCarregarArquivo.addEventListener('change', handleArquivoCarregado);
            btnsImportarCard.forEach(btn => btn.addEventListener('click', () => inputCarregarCard.click()));
            inputCarregarCard.addEventListener('change', handleCardImportado);
            
            // Inicialização
            iniciarAplicativo();
        });
    </script>
</body>
</html>
`

