# DioosMapas

Portal de campanhas de RPG com landing, carrossel, administração do catálogo e mapas interativos independentes. Projeto em React + TypeScript + Vite, Leaflet e funções Node na Vercel. Não é um VTT.

## Desenvolvimento

Requer Node 22.12+.

```sh
npm ci
```

Copie `.env.example` para `.env.local` e preencha `CAMPAIGN_IMORTAIS_PLAYER_PASSWORD`, `CAMPAIGN_IMORTAIS_ADMIN_PASSWORD` e `SESSION_SECRET` com suas próprias credenciais. As duas senhas devem ser diferentes; o segredo de sessão deve ser aleatório e ter pelo menos 32 caracteres. Gere-o localmente:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Nunca coloque segredos em variáveis `VITE_`, nos dados de campanha ou no Git. Reinicie o servidor após alterar as variáveis.

```sh
npm run dev
npm test
npm run build
```

O servidor Vite inclui a mesma API usada na Vercel. `npm run preview` serve apenas os arquivos estáticos; para testar autenticação localmente, use `npm run dev`. Sem as variáveis, a página funciona e a entrada informa que o Mestre ainda precisa configurar o acesso; não existe senha padrão nem desbloqueio fictício.

## Baixar e usar como base

Use **Code → Download ZIP** no GitHub ou clone o repositório:

```sh
git clone https://github.com/DiogoRBorba/mapasdioos.git
cd mapasdioos
npm ci
```

Configure `.env.local` conforme acima e execute `npm run dev`. Para desenvolvimento local, deixe `DATABASE_URL` vazia: os cadastros serão salvos em `.data/`, na sua máquina. Para hospedar sua própria versão, use seu projeto Vercel, seu banco Neon e seus próprios segredos. Configure também `CRON_SECRET` na Vercel para a limpeza agendada do feed.

O repositório inclui o código e os arquivos visuais básicos do aplicativo. Senhas, conexões de banco, vínculos locais com a Vercel, dados das campanhas cadastradas online, anotações privadas e capturas administrativas não são distribuídos. A pasta `private/maps` contém as imagens-base servidas pela API autenticada: o nome da pasta não torna seus arquivos secretos dentro de um repositório público.

Baixar, clonar ou criar um fork não concede permissão para alterar este repositório. Alterações na sua cópia permanecem independentes; contribuições ao original dependem da aprovação do proprietário.

## Publicação na Vercel

1. Envie este projeto a um repositório e importe-o na Vercel.
2. Selecione Vite, build `npm run build`, saída `dist` e Node 22.x ou compatível.
3. Em Environment Variables, configure `CAMPAIGN_IMORTAIS_PLAYER_PASSWORD`, `CAMPAIGN_IMORTAIS_ADMIN_PASSWORD` e `SESSION_SECRET` para os ambientes desejados. Os valores locais não são enviados automaticamente para a Vercel.
4. Conecte um banco PostgreSQL **Neon** e configure sua conexão em `DATABASE_URL`. O driver utilizado é o Neon serverless; uma URL de PostgreSQL genérica não basta. Use bancos separados para produção e previews. A aplicação cria as tabelas `dioos_map_pins`, `dioos_hunt_state`, `dioos_pin_images`, `dioos_campaigns` e `dioos_campaign_assets` conforme o primeiro uso; o usuário do banco precisa dessa permissão.
5. Faça o deploy. Teste entrada nos dois perfis, imagem do mapa, criação de um pin, leitura por outro jogador, atualização da página e encerramento de acesso na URL publicada. O adaptador Neon foi conectado ao projeto mapasdioos e recebeu a migração dos dados locais.

`vercel.json` configura a rota da campanha, os cabeçalhos e a inclusão da imagem privada na função. As APIs de sessão, imagem e pins são Vercel Functions; não dependem do plugin Sites. Documentação: https://vercel.com/docs/frameworks/frontend/vite

## Como usar o mapa

- Entre na primeira campanha como jogador ou administrador.
- Arraste para navegar; use a roda do mouse, os botões +/− ou a pinça no toque para aproximar. As setas do teclado movem o mapa quando ele está em foco. O botão de enquadramento retorna à imagem inteira.
- Filtre por **Locais**, **Atividades de Caça**, **Memórias**, **Aliados**, **Inimigos** e **Territórios**. A busca consulta título e descrição, ignorando acentos. Clique no pin ou na lista para consultar os detalhes.
- Como administrador, clique em **Novo pin**, escolha um ponto no mapa, preencha o título e escolha categoria, símbolo, formato e cor. A descrição é opcional. Nada é publicado antes de **Criar pin**.
- Para editar, selecione um pin e clique em **Editar pin**. **Alterar posição no mapa** permite reposicioná-lo antes de salvar. A remoção pede confirmação.
- Jogadores têm apenas leitura, inclusive na API. O botão **Atualizar mapa**, abaixo do dia/período, busca pins e o tempo aprovado pelo mestre. Não há consultas periódicas em segundo plano; filtros são individuais e não modificam os dados da mesa.
- O mapa começa sem pins. Não existe conteúdo fictício pré-cadastrado.


## Administração das campanhas

O escudo no canto superior direito da landing abre a administração com a mesma senha de administrador dos mapas. **Nova campanha** e os itens do catálogo abrem um formulário com título principal, subtítulo, sinopse, imagem de fundo, mapa e senha dos jogadores. A prévia mantém a identidade visual do carrossel. Sem mapa, o banner fica em preparação. Para preservar a senha ao editar, deixe o campo vazio.

As capas publicadas são públicas; mapas e anexos exigem a sessão correta. Uploads aceitam JPG, PNG e WebP de até 20 MB no navegador, com otimização para os limites da função Vercel (corpo enviado até 3 MB). Capas têm até 2400 pixels e mapas até 6000 no maior lado, sem ampliação artificial. Arquivos ainda grandes após compressão são recusados com mensagem. As dimensões do mapa são armazenadas e preservam sua proporção. Trocar a imagem mantém coordenadas proporcionais dos pins e exige conferir o alinhamento.

O catálogo local fica em `.data/campaigns.json`; novas campanhas têm arquivos separados para pins, período e anexos. As imagens de campanha ficam em `.data/campaign-assets`. Em produção tudo é separado por campanha no Neon. Rascunhos de imagem sem vínculo permanecem privados ao administrador; não há limpeza automática. O catálogo é carregado ao abrir a página, após salvar e ao retornar do mapa, sem consultas contínuas.

## Imagens nos pins

No editor de administrador, **Anexar imagens** permite selecionar até **seis imagens por pin**, em JPG, PNG ou WebP, com até **20 MB por arquivo original**. Há prévias e remoção individual. As imagens são otimizadas para WebP, com até 1600 pixels no maior lado, preservando proporção e corrigindo orientação. Arquivos grandes são reduzidos no navegador antes do envio; o servidor valida e reprocessa todos os arquivos com Sharp. SVG e imagens animadas não são aceitos pelo servidor.

Os anexos só ficam disponíveis aos jogadores depois de **Criar pin** ou **Salvar alterações**. No painel de descrição, os jogadores podem clicar nas miniaturas para ampliar e navegar pelas imagens, inclusive com as setas do teclado; Escape fecha a ampliação. Jogadores não podem enviar ou alterar anexos, inclusive pela API.

Localmente, os arquivos ficam em `.data/pin-images/`; inclua essa pasta no backup junto ao JSON dos pins. Com `DATABASE_URL`, as imagens ficam na tabela `dioos_pin_images`, separadas dos metadados consultados pelo mapa. A API `/api/pin-images` exige sessão e verifica se a imagem está vinculada a um pin ativo antes de entregá-la a jogadores. Rascunhos descartados e anexos removidos continuam armazenados e acessíveis apenas ao administrador; ainda não há limpeza automática de arquivos sem vínculo. A publicação na Vercel exige o mesmo Neon já usado pelos pins, sem um segundo serviço de armazenamento.

## Dia da caça e iluminação

O indicador destacado no canto superior direito mostra **Dia N | Manhã, Tarde ou Noite**. O padrão inicial é **Dia 1 | Tarde**. Somente o administrador vê o lápis para alterá-lo. Ele pode escolher qualquer dia inteiro positivo (inclusive voltar a um dia anterior), selecionar o período e clicar em **Aprovar e atualizar**. Cancelar descarta o rascunho. A iluminação permanece no período publicado enquanto o formulário está aberto.

O estado aprovado é salvo no servidor. Os jogadores recebem a versão atual ao abrir o mapa ou clicar em **Atualizar mapa**; mudanças de dia ou período recebidas nesse clique disparam a névoa de transição. O administrador vê sua própria aprovação imediatamente. O botão também atualiza os pins e impede solicitações simultâneas. Não há polling, atualização ao voltar à aba ou BroadcastChannel. Falhas de conexão ficam visíveis e aprovações concorrentes usam controle de revisão para evitar sobrescrita silenciosa.

`/api/map-state` permite leitura autenticada e publicação apenas por administrador. Localmente, `huntState` é adicionado ao mesmo arquivo `.data/imortais-pins.json`, preservando os pins existentes. Na Vercel, o adaptador Neon cria a tabela `dioos_hunt_state`; a configuração `DATABASE_URL` já descrita se aplica a ela também.

A renderização aplica nitidez leve e tratamento de contraste à imagem, com manhã mais clara, entardecer alaranjado e noite azulada com pontos de luz suaves. Os filtros afetam **somente a imagem**, mantendo pins e controles legíveis. O tooltip dos pins usa largura pelo conteúdo com quebra normal de palavras, corrigindo o nome exibido em uma coluna de letras.

## Mapa vivo e imagem restaurada

O mapa abre com `private/maps/imortais-restored.png`, uma restauração por IA de **1528 × 1029** (cerca de 1,62 vezes a quantidade de pixels original). A ferramenta não entregou os 3072 × 2064 solicitados. O desenho geral da cidade foi mantido visualmente, mas pequenos detalhes reconstruídos podem diferir: não é uma reprodução exata nem uma versão 4K. O original 1200 × 808 segue intacto em `private/maps/imortais.webp`. O botão de imagem no canto inferior direito alterna as duas versões sem mudar enquadramento, zoom ou coordenadas dos pins. Ambas são entregues pela API autenticada. Prompt e procedência: `outputs/map-restoration-prompt.txt`.

- Névoa de densidade irregular se desloca lentamente nas bordas geográficas do mapa, acompanhando zoom e arraste. Uma área central de exclusão impede a névoa ambiente de atravessar a cidade. As nuvens já embutidas na imagem continuam parte do fundo; o movimento vem de uma camada adicional.
- Aprovar uma mudança de **dia ou período** inicia uma transição de aproximadamente 2,4 segundos. A névoa cobre o mapa, a apresentação muda aos 900 ms, ainda sob cobertura completa, e as nuvens recuam. Uma simples atualização de revisão com os mesmos valores não toca a animação.
- A aprovação persiste imediatamente no servidor; cada cliente apresenta a transição quando recebe a atualização. Cada jogador escolhe quando sincronizar pelo botão Atualizar mapa; não há relógio de animação global entre dispositivos. A primeira abertura da página já mostra o período publicado, sem transição de entrada.
- À noite há pequenos brilhos âmbar sobre pontos fixos da cidade; são efeitos de ambiente, não novos pins. O entardecer tem uma camada de luz quente suave.
- Um pequeno bando de 3 a 5 pássaros passa por uma região visível aleatória aproximadamente a cada 15 segundos, durante cerca de 6 segundos. Voos não se acumulam quando a aba fica oculta.
- **Pausar animações** congela a névoa, interrompe pássaros e torna as trocas de período imediatas. A preferência de movimento reduzido do dispositivo faz o mesmo. Iluminação e filtros continuam disponíveis. A camada animada não intercepta cliques, toques ou arraste.

A atmosfera usa um canvas limitado a 30 quadros por segundo e densidade de pixels de até 1,5. Abas ocultas não desenham a cena; animações pausadas redesenham apenas quando a visão ou a iluminação muda. Não há serviços externos de animação, áudio ou novas dependências.

## Armazenamento dos pins

Sem `DATABASE_URL`, o desenvolvimento salva em `.data/imortais-pins.json`, ignorado pelo Git. Os dados sobrevivem a recarregamentos e reinícios do servidor e são compartilhados por quem acessa esse mesmo servidor. Faça backup desse arquivo se começar a cadastrar conteúdo real localmente. `PIN_DATA_FILE` existe para isolar testes; não precisa ser configurado no uso normal.

Na Vercel, o disco da função não é utilizado para persistência: `DATABASE_URL` é obrigatória para os pins. Sem ela, a API informa a indisponibilidade e o editor fica desativado. Novos pins criados apenas no ambiente local **não são migrados automaticamente** para o banco da publicação. A migração inicial foi feita por `scripts/migrate-neon.mjs`, preservando registros remotos existentes. Use a conexão Neon também no ambiente local se quiser cadastrar diretamente no mesmo banco, ou planeje a migração antes do primeiro deploy com dados reais.

Atualizações exigem a revisão atual do pin para evitar sobrescrever edições feitas em outra aba. Remoções são lógicas (`deleted`); a interface não possui lixeira/restauração nesta etapa. Títulos e descrições são exibidos como texto. A imagem original é preservada junto à restauração opcional; aproximar além da resolução de cada arquivo não acrescenta detalhes.

## Escopo e continuidade

- Nome confirmado: **DioosMapas**.
- Campanha confirmada: **A Última Valsa dos Imortais**.
- Entrada por perfil, com senhas distintas de jogador e administrador, sem contas individuais.
- Carrossel com setas, indicadores, rolagem por toque/trackpad e teclas de seta, Home e End quando o trilho recebe foco.
- Campanhas 02 a 05 começam como banners em preparação; o administrador pode adicionar textos, capa, senha e mapa para habilitar a entrada.
- Busca ignora diferenças entre maiúsculas, minúsculas e acentos.
- Interface responsiva, navegação por teclado e modais nativos com Escape.
- Logo e wallpaper atuais foram fornecidos pelo Mestre e copiados sem alteração; o layout aplica recorte responsivo e sobreposição de contraste por CSS. A frase de apresentação é uma proposta editorial.
- O mapa interativo, o editor de pins, os anexos, filtros, iluminação, névoa, pássaros e territórios desenhados são reutilizados em todas as campanhas com mapa cadastrado. Quests com progresso ainda não fazem parte desta etapa.
- O botão “Retornar às campanhas” encerra a sessão para facilitar o teste do outro perfil. Recarregar a página autenticada preserva a sessão enquanto válida.
- A referência MapGenie foi fornecida pelo usuário, mas não pôde ser inspecionada: a consulta web falhou e o navegador bloqueou o domínio. A implementação segue a descrição funcional do usuário.

## Acesso

A API compara a senha específica do perfil no servidor e emite uma sessão assinada, válida por 8 horas, em cookie HttpOnly e SameSite=Strict (Secure em produção). A assinatura inclui a campanha, o perfil e a versão do formato de sessão. O servidor rejeita alteração do perfil e sessões antigas sem perfil. Encerrar o acesso apaga o cookie do navegador. Trocar `SESSION_SECRET` invalida todas as sessões; trocar só a senha não revoga sessões já emitidas.

Nome e capa são públicos. O mapa está em `private/maps/imortais.webp`, fora do bundle público, servido por `/api/map-image` com validação da sessão. `/api/map-pins` exige sessão da campanha para leitura e perfil `admin` validado no servidor para qualquer escrita. O estado React não é uma fronteira de autorização. As respostas privadas usam `Cache-Control: no-store`. As senhas e o segredo nunca são enviados ao frontend.

Há limitação de tentativas por IP em memória da instância, útil como defesa básica. Antes de exposição pública ampla, adicione rate limiting compartilhado ou uma regra de WAF na Vercel: instâncias serverless não compartilham memória. Cada campanha tem cookie assinado próprio; uma sessão de outra campanha ou da administração do catálogo não abre seu mapa. A senha do administrador é compartilhada, mas o acesso é validado por campanha. Senhas de jogadores cadastradas no catálogo são armazenadas com scrypt e salt aleatório, nunca devolvidas pela API.

## Xweeter e exclusão de campanhas

O Xweeter fica **somente na landing page**, abaixo da coleção e da apresentação do atlas. Na administração, **Xweeters** lista os personagens e permite editar nome, retrato, senha e cor. Senha vazia na edição mantém a atual; o retrato pode ser trocado ou removido. A edição preserva o ID, as postagens e os comentários, e versiona a URL do retrato para evitar cache antigo. **Novo Xweeter** cadastra nome, senha própria, retrato opcional e cor das postagens, com prévia. Retratos são convertidos para WebP de 256 × 256; as senhas são armazenadas com scrypt e salt. A sessão de personagem dura oito horas e usa um cookie HttpOnly separado dos acessos às campanhas e ao catálogo.

O mural é público para leitura. Publicar exige a senha do personagem, aceita somente texto/emojis e tem limite de 500 caracteres e intervalo mínimo de dez segundos por personagem. A identidade do autor vem da sessão validada no servidor. Não há curtidas, anexos, polling ou consultas de atualização em segundo plano. Carregamento inicial, botão **Atualizar mural** e paginação de 30 posts controlam as consultas.

Posts deixam de ser exibidos após 72 horas, inclusive numa aba aberta (temporizador local, sem consulta). Leituras/escritas removem fisicamente os vencidos do banco. A limpeza diária adicional é `/api/feed?action=cleanup`, protegida por `CRON_SECRET`, às 08:00 UTC (05:00 de Brasília; janela de execução do plano Hobby). Como aprovado, a remoção física pode ocorrer no próximo acesso ou nessa rotina diária; os posts já ficam invisíveis ao completar 72 horas. Retratos e personagens permanecem para futuras postagens. Backups históricos seguem a retenção do provedor.

O editor de uma campanha existente oferece **Excluir campanha**, seguido de diálogo com nova confirmação da senha do administrador. A API exige sessão administrativa da plataforma, senha correta e revisão atual. Campanhas excluídas deixam o catálogo e são recusadas pelas APIs de mapa mesmo com cookies já emitidos. Um registro mínimo de exclusão evita que campanhas iniciais reapareçam em reinicializações. Os antigos dados de mapa/pins permanecem armazenados sem acesso pela campanha; não há restauração no painel.

Armazenamento local do mural: `.data/xweeter.json` (ou `FEED_DATA_FILE` para testes). Produção: tabelas `dioos_xweeters` e `dioos_xweets` no Neon. Configure também `CRON_SECRET` no ambiente de produção. Os testes de `tests/feed.test.js` e `tests/campaigns.test.js` cobrem autenticação, exclusão, concorrência, paginação e expiração. A verificação `scripts/check-feed-database.mjs` exercita o Neon usando somente IDs temporários que remove ao concluir.

## Arquivos principais

### Territórios e símbolos fornecidos

**Novo pin → Território com linhas** inicia o contorno. Clique para adicionar vértices e clique novamente no ponto inicial para fechar (ou use **Fechar território** após três pontos). Só então o editor pede título, descrição, anexos, símbolo e cor. É possível desfazer o último ponto, cancelar com Escape e redesenhar uma área pelo editor. Cancelar um redesenho preserva o contorno anterior. Arrastar e zoom continuam disponíveis durante o desenho.

Os territórios usam de 3 a 128 pontos normalizados em `vertices`, persistidos no mesmo registro JSON do pin. A API rejeita pontos fora do mapa, repetidos, contornos degenerados, linhas sobrepostas e cruzamentos. O centro do marcador é calculado no servidor. Os jogadores podem ler e filtrar essas áreas; somente administradores podem criá-las, editá-las ou removê-las. Pins territoriais antigos sem contorno permanecem compatíveis.

Os 36 PNGs fornecidos em `Downloads/Icones` estão disponíveis no editor em **Símbolos Dioos**. Miniaturas transparentes de 128 × 128 ficam em `public/images/pin-symbols/`; cópias integrais sem alteração ficam em `public/images/pin-symbols/originals/`. O manifesto `shared/custom-symbols.js` associa IDs, rótulos e arquivos. Os formatos e cores de borda dos pins existentes permanecem disponíveis. Símbolos coloridos conservam a cor da imagem original.

`shared/territories.js` reúne a validação geométrica usada pelo cliente e pelo servidor. `tests/territories.test.js` verifica geometria, permissões, persistência, compatibilidade e os 36 arquivos. A suíte completa tem **97 testes**.

- `src/main.tsx`: página inicial, carrossel, seleção de perfil e roteamento para o mapa.
- `src/map/`: navegação Leaflet, filtros, detalhes e editor de pins.
- `shared/map.js`: categorias, símbolos, cores e dimensões do mapa.
- `src/campaigns.ts`: metadados públicos da campanha.
- `src/styles.css` e `src/brand.css`: base visual, identidade Dioos RPG e layout responsivo.
- `api/campaign-access.js`: validação de senha e sessão.
- `api/map-image.js` e `api/map-pins.js`: imagem privada e API de leitura/escrita.
- `server/pin-store.js`: persistência local e adaptador Neon; `server/pin-validation.js`: validação de dados.
- `api/map-state.js`, `shared/hunt.js`, `src/map/HuntClock.tsx` e `src/map/useHuntState.ts`: aprovação, persistência e sincronização do dia/período.
- `src/map/hunt.css`: indicador, editor de período e iluminação da imagem.
- `src/map/atmosphere.ts`, `src/map/useMapTransition.ts` e `shared/atmosphere.js`: atmosfera e transição de período sob cobertura.
- `api/pin-images.js`, `server/pin-images.js`, `src/map/PinImagesField.tsx` e `src/map/PinGallery.tsx`: envio autenticado, otimização, armazenamento e galeria dos anexos.
- `tests/*.test.js`: 97 testes de autenticação, autorização, validação, persistência local, concorrência, imagens privadas, aprovação do período, temporização da transição, anexos, exclusão de campanhas e feed Xweeter. Não substituem a validação do deploy com Neon.
- `private/maps/imortais.webp`: mapa fornecido pelo Mestre, cópia sem edição de `1316786.webp`.
- `public/images/dioos-logo.png`: logo original fornecida pelo Mestre.
- `public/images/imortais-wallpaper.png`: wallpaper fornecido para A Última Valsa dos Imortais.
- `docs/art-direction.md`: histórico da direção visual.

Projeto de publicação: mapasdioos, equipe diostirlings-projects. Neon: dry-king-92455878, branch de produção br-silent-union-b6v5job0. Credenciais ficam somente nos arquivos locais ignorados e nas variáveis privadas da Vercel; não são incluídas no deploy de código. Verificação visual realizada em desktop e largura móvel de 390 px; gestos de pinça dependem do dispositivo e ainda não foram conferidos em um celular físico.

## Blog de notícias

A navegação **Notícias** abre `/noticias`; cada artigo tem endereço próprio em `/noticias/:id`. A área superior direita da landing mostra até três notícias recentes em cards com capa opcional, campanha, resumo e **Ler notícia**. Sem publicações, apresenta um estado vazio; nenhum texto fictício é publicado automaticamente.

Na administração da plataforma, **Notícias → Nova notícia** permite cadastrar título, resumo, campanha opcional, texto (até 30.000 caracteres) e capa. Capas são otimizadas para WebP de até 1600 × 1200. O editor permite alterar e excluir; a exclusão pede confirmação e remove também os comentários. Revisões impedem sobrescrever uma edição mais recente.

Comentários usam a mesma sessão e senha dos personagens do Xweeter, com texto/emojis de até 1.000 caracteres. A identidade vem do cookie assinado; o administrador pode moderar comentários. Notícias e comentários permanecem até exclusão administrativa, separados da expiração de 72 horas dos posts do mural. Sem atualização automática: carregamento inicial, paginação e botão de atualizar comentários. Em produção, o intervalo mínimo de dez segundos por personagem é compartilhado entre mural e comentários.

`api/news.js` e `server/news-store.js` atendem o blog. Neon usa `dioos_news` e `dioos_news_comments`, com exclusão de comentários em cascata. Desenvolvimento usa `.data/news.json` ou `NEWS_DATA_FILE`. `tests/news.test.js` verifica autorização, capas, concorrência, identidade, validação, paginação e exclusão; `scripts/check-news-database.mjs` verifica o adaptador Neon e remove apenas seus registros temporários. A suíte completa tem 97 testes.

## Atmosfera e cabeçalho por campanha

No mapa, administradores abrem **Efeitos** no canto inferior direito. São 12 controles independentes: nuvens periféricas, pássaros, chuva, neve, iluminação do período, luzes noturnas, luz vermelha, tochas, brasas, vagalumes arcanos, TV antiga e transição de névoa. Intensidade de 10 a 100%, prévia somente local, restaurar padrão e desligar todos. Cancelar descarta a prévia; **Salvar efeitos** publica para a campanha. A imagem original não é alterada e nuvens pintadas nela não podem ser desligadas.

O lápis no relógio permite mudar título do indicador, nome da contagem, número do dia, período e data livre (até 80 caracteres). A data personalizada substitui a contagem no cabeçalho; apagá-la restaura o número do dia. A mudança de data livre também usa a transição de névoa quando habilitada. Títulos, efeitos e calendário são específicos de cada campanha.

`/api/map-state` recebe alterações parciais com revisão obrigatória: editar o relógio preserva os efeitos e vice-versa. As colunas JSON `effects` e `header` são adicionadas à tabela `dioos_hunt_state` sem redefinir períodos existentes. Mapas antigos recebem os controles visuais anteriores como padrão. Jogadores só leem as configurações e buscam mudanças no botão **Atualizar mapa**; as animações rodam no cliente, sem polling nem gravações por quadro.

A camada Canvas é limitada a aproximadamente 30 quadros/s, não desenha em abas ocultas e respeita pausa e movimento reduzido. Os efeitos ficam abaixo dos pins e não interceptam navegação. Texturas de ruído são geradas uma vez. `tests/effects.test.js` cobre compatibilidade, autorização, isolamento, validação e conflitos; `scripts/check-effects-database.mjs` verifica o Neon com somente dois estados temporários, removidos ao concluir.

## Ordem da coleção e composição do blog

A numeração pública das campanhas é calculada pela posição atual, sem lacunas após exclusões. IDs, links, mapas, senhas e pins não são renomeados. A administração oferece setas para subir/descer cada campanha, com salvamento imediato e proteção de revisão contra alterações simultâneas. Novas campanhas entram no final; editar uma campanha preserva sua posição. Na busca da landing, os números seguem a posição dentro do resultado exibido.

`PATCH /api/campaigns?action=order` exige sessão administrativa da plataforma, origem válida, lista completa de IDs ativos e revisão atual da ordem. A ordem é armazenada separadamente dos dados de campanha em `dioos_campaign_order` no Neon; localmente em `campaigns.json.order.json`. O catálogo público devolve `orderRevision`. A separação evita sobrescrever edições de conteúdo ao mover campanhas. `tests/campaign-order.test.js` cobre exclusão, renumeração, autorização, persistência, edição, novas campanhas e concorrência. `scripts/check-campaign-order-live.mjs` verifica produção salvando a mesma ordem atual, sem mover campanhas.

O índice de notícias usa um feed vertical centralizado, com autoria, data e acesso à leitura/comentários em cada card. Cards da landing, artigos, comentários e regras de publicação permanecem com o mesmo funcionamento.


## Campanhas sociais

O catálogo oferece `map` (Somente Mapa), `social` (Campanha Social) e `shadows` (Mundo das Sombras). Registros antigos continuam como `map`; `shadows` reserva o tipo e mantém a experiência de mapa até suas mecânicas serem definidas. Uma campanha social precisa de senha de jogador, mas não de mapa. A conversão não troca IDs, capas, senhas, pins ou a ordem da coleção.

`src/social/` implementa o campus: menu lateral, relacionamentos, perfis, universidade e o Xweeter global incorporado. O Mestre cria jogadores e NPCs, com retratos e biografias. Cada jogador se vincula a um Xweeter existente, único por campanha. Após entrar na campanha, o jogador escolhe seu personagem e usa a senha daquele Xweeter (ou confirma a sessão correspondente já conectada). O servidor deriva sua identidade do cookie e confere o personagem esperado em toda gravação. A troca de sessão em outra aba não permite gravar no personagem errado.

Afinidades vão de -5 caveirinhas a +5 corações, com zero neutro. Todos os participantes veem as relações, mas apenas o próprio personagem pode alterá-las. Atividades e quests têm conclusão individual; provas aceitam perguntas abertas ou de alternativa única. Rascunhos só aparecem ao Mestre. Provas publicadas permitem entrega/reenvio; encerradas ficam em leitura. Respostas ficam disponíveis apenas para seu autor e o Mestre, com uma cópia dos enunciados no momento da entrega. Não há correção automática. Datas/prazos são texto narrativo; o Mestre encerra manualmente quando necessário.

`api/social.js` verifica a sessão da campanha e suas permissões. `server/social-store.js` usa no Neon `dioos_social` (estado JSON por campanha com revisão e atualização condicional) e `dioos_social_portraits` (retratos WebP separados). Escritas concorrentes de personagens diferentes são reaplicadas sem sobrescrever seu progresso; edições do Mestre exigem a revisão atual do registro. Em desenvolvimento, os arquivos ficam em `.data/social/` ou ao lado de `PIN_DATA_FILE`. Atualização por entrada, navegação, gravação e botão Atualizar; sem polling. Os 12 testes de `tests/social.test.js` cobrem acesso, vínculos, isolamento, imagens, concorrência, formulário, privacidade das entregas e exclusão.

### Pontos e cadastro social unificado

- No cabeçalho, o Mestre usa **Dar pontos** para somar pontos a um jogador ou a todos os jogadores da campanha. O saldo individual aparece no canto superior direito após a seleção do personagem. O botão Atualizar campanha traz o saldo mais recente, sem consultas periódicas.
- Concessões usam identificadores únicos: repetir a mesma solicitação não soma duas vezes. Edições do perfil preservam o saldo. Jogadores não podem conceder pontos.
- Jogadores e NPCs aparecem tanto em Personagens quanto em Relacionamentos. Todo novo perfil precisa vincular um Xweeter existente ou criar um com senha e cor no próprio formulário. O novo Xweeter recebe o nome e retrato e fica disponível no feed global. As credenciais existentes não são modificadas ao vincular.

### Passos de atividades e quests

Atividades e quests novas têm de 1 a 20 passos, cada um com descrição de até 2.000 caracteres. O Mestre marca os passos em Ver detalhes e pode declarar a tarefa Completada ou Fracassada, mesmo com passos pendentes, ou reabri-la. O progresso é compartilhado por toda a campanha; jogadores apenas consultam e usam Atualizar campanha. Provas mantêm seus formulários e entregas individuais. Tarefas anteriores continuam disponíveis e podem receber passos pela edição. Alterações usam revisão para impedir sobrescrita de progresso por editores desatualizados.

### Diário, pontos e calendário escolar

- **Ajustar pontos** permite adicionar ou retirar pontos de um jogador ou de todo o grupo. O saldo pode ficar negativo; concessões repetidas com o mesmo ID não duplicam o ajuste.
- O diário tem busca por nome/papel, filtros Todos/NPCs/Jogadores e tags de afinidade de acordo com os corações e caveiras do diário selecionado.
- Cada jogador mantém uma anotação privada de até 4.000 caracteres por personagem. A API entrega apenas as notas do personagem autenticado, ou todas para o Mestre. O Mestre pode ler as notas escolhendo o diário; não edita o texto do jogador. As notas são persistentes, diferentemente dos posts temporários do Xweeter.
- O cartão de calendário escolar compartilha o estado e as permissões de `/api/map-state`. Mostra semana (7 dias), dia e período; aceita cabeçalho e data personalizada, com aprovação pelo Mestre e atualização manual pelos jogadores. Não há polling nem calendário independente do mapa.

### Páginas de mapa

Disponíveis em todas as campanhas que possuem mapa, incluindo a aba Mapa das campanhas sociais. O administrador cadastra imagens de áreas em **Gerenciar mapas → Adicionar mapa**, com nome e descrição opcional. Em **Novo pin → Páginas de mapa**, desenha uma área por cliques, fecha no ponto inicial e escolhe o destino cadastrado. O jogador entra diretamente ao clicar na área ou no marcador; o Mestre abre os detalhes para editar ou entrar no destino. O seletor lateral também permite navegar, e mapas de área têm **Mapa principal** no canto superior esquerdo.

Cada mapa mantém pins, anexos e territórios próprios. O principal usa os registros existentes sem migração; mapas novos usam `data.mapId` nos pins. Data, cabeçalho e efeitos continuam compartilhados pela campanha. Há suporte a links entre áreas e de volta ao principal, mas links para o próprio mapa e para outras campanhas são rejeitados. Excluir um link não exclui seu mapa de destino nem seus pins. Mapas cadastrados podem ser renomeados e receber outra imagem com confirmação de preservação das posições relativas.

O catálogo é persistido em `dioos_map_pages` no Neon (criação aditiva da tabela), ou `mapPages` no arquivo local já isolado por campanha. `/api/map-pins?action=pages` e `action=map-upload` reutilizam a sessão da campanha e exigem administrador para escrita; `/api/map-pins?map=ID` e `/api/map-image?map=ID` conferem pertencimento à campanha. Imagens são enviadas pelo administrador e carregadas quando o jogador abre o mapa; não há polling nem download automático de todos os mapas. Os testes de `tests/map-pages.test.js` cobrem permissões, isolamento, compatibilidade, geometria, anexos e conflitos de edição.
