# Changelog

Versão 1.2.0 (23/06/2026)
* Novidades:
    - Etiquetas (tags) também em recorrências e parcelamentos: o seletor aparece nos formulários, as etiquetas são aplicadas a cada ocorrência/parcela gerada e os chips coloridos surgem nas listas
    - Revisão de duplicidades guiada: o aviso de "possível duplicidade" ganhou o botão "Analisar lançamentos", que abre uma tela para decidir, grupo a grupo, quais excluir ou confirmar como legítimos
    - Filtro "Apenas possíveis duplicidades" no extrato
    - Aplicar tags em massa: ao selecionar vários lançamentos, o botão "Tags" adiciona etiquetas a todos de uma vez (sem remover as já aplicadas)
* Correções:
    - Lista de tags agora rola corretamente quando aberta dentro de formulários e do painel de filtros

Versão 1.1.0 (23/06/2026)
* Novidades:
    - Etiquetas (tags) nos lançamentos: seletor com criação rápida e cores, filtro do extrato por etiqueta, chips coloridos e gerenciamento nas configurações
    - Campo de observação nos lançamentos
    - Página de Documentos: envio direto, lista, download, exclusão e importação por IA
    - Importação por IA a partir de um documento já enviado, sem precisar reenviar o arquivo
    - Gerenciamento de categorias e instituições personalizadas nas configurações, com envio de logo (inclui o monograma da Havan)
* Melhorias:
    - Acompanhamento do progresso da leitura parte a parte ("lendo parte X de Y") em documentos grandes

Versão 1.0.0 (22/06/2026)
* Novidades:
    - Nova etapa de confirmação na importação com IA: após enviar, você vê os dados do documento (nome, tipo, tamanho e número de páginas) antes de a IA ler o arquivo
    - Arrastar e soltar o documento na área de envio
* Melhorias:
    - Acompanhamento do progresso da leitura quando o documento é processado em segundo plano

Versão 0.2.0 (21/06/2026)
* Novidades:
    - Temas de cor: claro, escuro e automático (conforme o sistema)
    - Alertas de duplicidade, verificação de consistência com IA e divisão de despesas
    - Edição de perfil do usuário e login com Google
    - Cartões de crédito separados das contas bancárias na interface
    - Página de família com convites por e-mail ou telefone
    - Sugestão de séries recorrentes e criação de recorrências a partir de um lançamento
    - Previsão de faturas de cartão e de parcelas de conta
    - Parcelamentos em cartão, edição de planos e do vencimento de cada parcela
    - Remoção em massa de lançamentos duplicados, com confirmação
    - Estorno da confirmação de um lançamento concluído
    - Filtro por período com atalhos, além de busca e filtros no extrato e em parcelamentos
    - Telefone internacional no perfil
    - Seleção em massa ("selecionar tudo") e "carregar mais" nas listas
    - Navegação inferior no celular
    - Despesas compartilhadas que um membro deve aparecem no painel dele
    - Comemoração ao quitar um parcelamento
* Melhorias:
    - Repaginação visual (estilo fintech), barra lateral de filtros e ações de IA agrupadas
    - Acompanhamento, no modal de importação, da confirmação processada em segundo plano
    - Layout responsivo aprimorado e notificações que seguem o tema do app no modo escuro
    - Página "Lançamentos" renomeada para "Extrato" e remoção de emojis das categorias
    - Símbolos de moeda e seletor de início da semana nas configurações
    - Seletor de mês/ano no calendário e seletor real de modelo de IA
    - Correções de build e implantação (TypeScript 6.0.3 e nginx no EasyPanel)

Versão 0.1.0 (20/06/2026)
* Novidades:
    - Primeira versão do Nossa Grana, um PWA de finanças com suporte offline
    - Importação de extratos, comprovantes e arquivos CSV/OFX com IA
    - Páginas de orçamentos, recorrências, parcelamentos, faturas e investimentos
    - Configurações de perfil e de preferências de IA (provedor e busca de modelos)
    - Recuperação de senha e verificação de e-mail
    - Seleção de banco com logos no cadastro de conta
* Melhorias:
    - Tema escuro monocromático elegante e importação por IA em modal na página de transações
    - Mostrar/ocultar senha no login e calendário com seletor de mês/ano
    - Barra de rolagem fina e adequada ao tema
