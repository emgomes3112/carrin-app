# Carrin — Requisitos do Sistema (REQUIREMENTS.md)

Este documento define os requisitos funcionais (RF) e não-funcionais (RNF) técnicos do sistema **Carrin**, modelados especificamente para a viabilidade e escala do MVP (Mínimo Produto Viável) e futuras expansões.

---

## 1. Requisitos Funcionais (RF)

### 1.1. Autenticação e Gestão de Contas
* **RF-001 (Cadastro e Login)**: O sistema deve permitir o cadastro e autenticação de usuários em duas modalidades: **Clientes** e **Parceiros (Pickers)**.
  - Para clientes: cadastro simplificado via e-mail/senha ou OAuth social (Google/Apple) e telefone.
  - Para parceiros: cadastro detalhado contendo nome, CPF, e-mail, telefone, foto de perfil, fotos de documentos (RG/CNH) e dados bancários/chave Pix para recebimento.
* **RF-002 (Aprovação de Parceiros)**: O sistema deve fornecer um painel administrativo básico para que a equipe de operações analise, aprove ou recuse o cadastro de novos parceiros.
* **RF-003 (Gestão de Perfil)**: Ambos os usuários devem poder atualizar seus dados básicos de cadastro, dados de pagamento e configurações de notificação.

### 1.2. Criação de Pedidos e Gestão de Listas (Cliente)
* **RF-004 (Seleção de Estabelecimento)**: O sistema deve permitir que o cliente selecione um supermercado com base em sua localização geográfica atual ou endereço fornecido.
* **RF-005 (Montagem de Lista de Compras)**: O sistema deve permitir que o cliente monte uma lista de compras.
  - Deve ser possível selecionar itens de um catálogo básico fornecido pela plataforma.
  - Deve ser possível adicionar **Itens Personalizados** digitando o nome, quantidade, marca preferencial e observação textual (ex: "1kg de banana nanica pouco madura").
* **RF-006 (Pedido Mínimo)**: O sistema deve impedir a finalização e submissão de listas que contenham menos de 10 itens ativos.
* **RF-007 (Seleção de Serviços Adicionais)**: O cliente deve poder optar por contratar serviços adicionais:
  - Acompanhamento na fila do caixa (+ taxa fixa).
  - Auxílio no empacotamento das compras (+ taxa fixa).
* **RF-008 (Cálculo e Pagamento da Taxa de Serviço)**: O sistema deve calcular o valor total da taxa de serviço com base na tabela progressiva por número de itens e serviços opcionais selecionados.
  - O pagamento da taxa de serviço deve ser processado antes do pedido ser enviado aos parceiros.
  - O MVP deve integrar um gateway de pagamentos para suporte a **PIX** e **Cartão de Crédito**. Os fundos devem ficar em custódia (escrow) até a conclusão do serviço.

### 1.3. Despacho e Aceite de Pedidos
* **RF-009 (Matchmaking de Pedidos)**: Após a confirmação de pagamento do cliente, o pedido deve ficar no status "Aguardando Parceiro" e ser visível para parceiros disponíveis em um raio de até 5 km do supermercado selecionado.
* **RF-010 (Aceite de Pedido)**: Um parceiro deve poder visualizar a lista de pedidos disponíveis (com detalhes de supermercado, quantidade de itens e valor a receber) e aceitar o serviço. Apenas um parceiro pode aceitar cada pedido (travamento de concorrência).
* **RF-011 (Bloqueio de Edição)**: O sistema deve bloquear a edição direta e livre da lista de compras pelo cliente no momento em que o parceiro aceitar o pedido.

### 1.4. Fluxo de Separação (Picker/Parceiro)
* **RF-012 (Início da Coleta)**: O parceiro deve sinalizar no app que chegou ao supermercado e iniciou a separação física dos itens. O status do pedido muda para "Em Separação".
* **RF-013 (Validação por Código de Barras)**: O app do parceiro deve permitir a leitura do código de barras de itens industrializados usando a câmera do smartphone para marcar o item como "Encontrado".
* **RF-014 (Validação Manual por Foto)**: Para itens de peso/granel ou falhas de leitura do código de barras, o parceiro deve poder tirar uma única foto do produto (junto à etiqueta de preço) e digitar o valor unitário manualmente para marcar o item como "Encontrado".
* **RF-015 (Registro de Falta de Estoque)**: Caso o item não esteja disponível, o parceiro deve marcar o item como "Em Falta". O app deve exigir que o parceiro opcionalmente tire foto de uma alternativa semelhante na prateleira para oferecer como substituição.

### 1.5. Fluxo de Substituição e Comunicação Real-time
* **RF-016 (Notificação de Item em Falta)**: Quando um item for marcado "Em Falta", o sistema deve enviar uma notificação push imediata e de alta prioridade ao cliente.
* **RF-017 (Decisão de Substituição pelo Cliente)**: O cliente deve visualizar o item faltante e escolher entre:
  - Aceitar a proposta de substituição sugerida pelo parceiro.
  - Solicitar um produto alternativo personalizado via chat.
  - Remover o item da lista (sem reembolso proporcional da taxa de serviço no MVP).
* **RF-018 (Tempo de Resposta Limite)**: O cliente pode responder sobre a falta do produto até o momento em que o parceiro clicar em "Concluir Coleta".
  - Se houver pendências de resposta no momento em que o parceiro tentar concluir o picking de toda a lista, o sistema iniciará um timer de **3 minutos** visível para ambos.
  - Caso o timer expire sem resposta do cliente, os itens sem resposta serão classificados automaticamente como "Removidos".
* **RF-019 (Chat Interno)**: O sistema deve fornecer um chat de texto em tempo real entre o cliente e o parceiro ativo durante o período que vai do aceite do pedido até a finalização do handoff.

### 1.6. Coordenação e Encontro (Handoff Seguro)
* **RF-020 (Sinalização de Deslocamento e Chegada do Cliente)**: O cliente deve poder enviar atualizações de status para o parceiro pelo app: "A caminho (ETA 10 min)" e "Cheguei no local". O cliente deve poder informar seu ponto de referência (ex: "estou na entrada principal ao lado do quiosque X").
* **RF-021 (PIN de Handoff Seguro)**: O sistema deve gerar um código numérico de 4 dígitos (PIN) exclusivo no aplicativo do cliente quando o pedido for para o status "Aguardando Handoff".
  - O parceiro deve solicitar este código presencialmente ao cliente no momento do encontro e digitá-lo no seu próprio aplicativo para validar a entrega física do carrinho de compras.
  - A validação correta do PIN altera o status do pedido para "Entregue/Handoff Concluído" e inicia a liberação dos fundos do parceiro.
* **RF-022 (Fila e Caixa)**: Caso contratado o "Acompanhamento no Caixa", após o Handoff Seguro, o parceiro conduz o carrinho até a fila do caixa físico e aguarda o cliente. Se contratado o "Empacotamento", o parceiro ajuda a ensacar os produtos durante a passagem dos mesmos pelo caixa do supermercado.
* **RF-023 (Finalização do Pedido)**: O pedido deve ser marcado como "Finalizado" assim que as ações adicionais no caixa terminarem (ou após o handoff, se não houver extras), liberando a tela de avaliação.

### 1.7. Cancelamento e Avaliações
* **RF-024 (Regras de Cancelamento Automático e Reembolso)**: O sistema deve calcular taxas de cancelamento e aplicar reembolsos de acordo com o status atual:
  - Cancelamento pelo cliente antes de 2 minutos do aceite: reembolso total.
  - Cancelamento pelo cliente após início de separação: taxa de cancelamento de 50% cobrada (repassada ao parceiro).
  - No-show do cliente (não digitou PIN após 15 minutos do parceiro aguardando no local): cancelamento do pedido sem reembolso. 100% da taxa de serviço é repassada ao parceiro.
* **RF-025 (Avaliação Recíproca)**: Após a conclusão do pedido, o cliente deve poder avaliar o parceiro (nota de 1 a 5 estrelas e comentário livre) e o parceiro deve poder avaliar o comportamento do cliente (nota de 1 a 5 estrelas).

---

## 2. Requisitos Não-Funcionais (RNF)

### 2.1. Conectividade e Resiliência (Modo Offline)
* **RNF-001 (Operação Offline do Picking)**: O aplicativo do parceiro deve ser capaz de realizar o escaneamento de código de barras e salvar fotos localmente em caso de perda de conexão de internet móvel dentro dos supermercados.
* **RNF-002 (Sincronização em Lote)**: Assim que a conexão for reestabelecida, o aplicativo do parceiro deve sincronizar automaticamente os status salvos em cache local com o banco de dados centralizado em menos de 5 segundos.

### 2.2. Performance e Latência
* **RNF-003 (Latência de Mensageria Chat)**: As mensagens enviadas pelo chat devem ser entregues entre cliente e parceiro com latência máxima de 2 segundos sob conexões de dados 3G/4G normais.
* **RNF-004 (Compressão Automática de Imagens)**: Qualquer foto enviada pelo parceiro (comprovante de item personalizado, substituto ou foto de no-show) deve passar por compressão em nível de cliente mobile para no máximo 300 KB antes do upload, economizando plano de dados e acelerando o tempo de sincronização.

### 2.3. Segurança e Privacidade
* **RNF-005 (Criptografia de Dados)**: Todo tráfego de dados entre os aplicativos clientes e a API backend deve ser criptografado via protocolo HTTPS (TLS 1.3).
* **RNF-006 (LGPD e Mascaramento de Contato)**: Em conformidade com a LGPD (Lei Geral de Proteção de Dados), o app deve mascarar/ocultar os números de telefone reais de clientes e parceiros no chat interno e em qualquer comunicação.
* **RNF-007 (Segurança de Pagamento e Escrow)**: Nenhuma credencial de cartão de crédito deve ser armazenada nos servidores do Carrin. O processamento deve ser delegado inteiramente a um gateway certificado PCI-DSS por meio de tokenização.

### 2.4. Disponibilidade e Escalabilidade
* **RNF-008 (Disponibilidade)**: O backend da aplicação (Carrin API) deve operar com taxa de disponibilidade mínima de 99,5% (SLA anual).
* **RNF-009 (Concorrência de Aceite)**: O sistema de concorrência de pedidos deve implementar travas transacionais (ex: Redis locks ou isolamento de banco de dados serializável) para garantir que um pedido nunca seja aceito por dois parceiros simultaneamente.

### 2.5. Usabilidade e Acessibilidade
* **RNF-010 (Contraste e Legibilidade)**: A interface do aplicativo do parceiro deve possuir alto contraste visual e fontes legíveis para permitir o uso confortável sob as condições de luz de lâmpadas fluorescentes de supermercados e sob o sol (área de estacionamento/entrega).
* **RNF-011 (Tamanho do App)**: O pacote de instalação do aplicativo mobile (APK/AAB) não deve passar de 45 MB para facilitar o download de forma rápida mesmo sob conexões de internet móvel limitadas.
