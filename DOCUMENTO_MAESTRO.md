# O Pulo do Gatto — Documento Maestro

## 2026-11-16 — Meta diária

- Menu principal: **Individuais → Meta diária → Pausas**, com acesso de Resultados.
- Seletor GATTO/GIO com dados carregados pela API do painel. GIO usa **Executado Protegendo**, limitado a 2026. A janela crítica começa em 10/09/2026 e acompanha a última data disponível.
- Compara meta em reais, primeira perda, primeira operação positiva e primeiro saldo diário positivo. Calcula resultado líquido, perdas, drawdown máximo por fechamento e por pregão e resultado líquido sobre drawdown por fechamento, usando as operações executadas em cada cenário.
- Usa a ordem de saída registrada para GATTO e a ordem da operação no ID para GIO.
- Se a carga do GIO vier vazia ou com cobertura inferior à referência, o módulo apresenta os resultados agregados verificados de 2026 e da janela crítica até 13/11/2026, com indicação da origem na tela.

## 2026-11-14 — Drawdowns por operação

- Menu principal: **Comparativo → Drawdowns → Individuais**. O item Drawdowns tem ícone próprio e acesso em nível principal.
- Reutiliza o explorador e a identidade visual do módulo Drawdowns existente, com filtros de Setup GATTO/GIO e operações: todas, Op1, Op2, Op3, Op1+Op2, Op1+Op3 ou Op2+Op3.
- Fonte única: operações financeiras reais já carregadas pela API do site (`state.gattoAll` / `state.gioAll`) e recorte temporal ativo. Sem dataset ilustrativo do mockup e sem nova consulta à planilha.
- Mantém o cálculo por fechamento, seleção de episódios, mapa, gráficos, modos de análise, escala e referência de quebra existentes. O filtro de operação usa a ordem persistida no registro ou o sufixo de operação do ID.
- Entrega: branch e PR próprios; publicação no GitHub Pages após revisão.


## 2026-11-08 — Drawdowns comparados e Sistema de Pausas

- Comparativo: Drawdowns comparados entre Comparativo linha a linha e Operações e dados.
- Sistema de Pausas: Radar de drawdowns e Regimes de risco, entre Comparativo e Escalada.
- As três páginas reutilizam a carga atual do painel; não publicam arquivos de operações. Comparativos emparelham por ID e data; sinais de pausa são simulados ao fechamento do pregão.

## 2026-11-06 — Comparativo linha a linha

- Posição: Comparativo → Desempenho por operação → **Comparativo linha a linha** → Operações e dados.
- Fonte única: a resposta já carregada pela API do painel. Nenhuma nova consulta à planilha e nenhum conjunto fixo de operações na nova página.
- Pareamento: ID GATTO (`operacoes[].id`, equivalente a PARA_SITE A) com ID GIO (`comparativoGio[].id`, Q). Compara `pontos` de GATTO (L) com `protected` de GIO (V), a R$ 0,20/ponto para um contrato.
- Diferenças entre L e T são informativas e não excluem pares. Zeros são válidos; resultados ausentes e IDs sem par ficam fora e aparecem na cobertura. Preserva o sufixo Op1/Op2/Op3.
- Controles próprios: linha ou três painéis, histórico/ano, operação/pregão, curvas sobrepostas/separadas, vantagem acumulada; métricas, drawdown e recortes anuais/mensais.
- Compatibilidade: mantém os cálculos e as bases dos submenus anteriores. Tema, autenticação e permissão `resultados` permanecem no fluxo existente.
- Validação: testes do módulo e da integração, fixtures com zero/pendências/IDs duplicados, reconciliação com o payload real e conferência independente de totais e drawdown por linha. A prova com a API em 06/11/2026 retornou 565 pares de 2026 (209/193/163); estes números são apenas evidência de teste e não estão fixados na aplicação.
- Entrega: branch e PR próprios, com publicação no GitHub Pages após validação.

## 2026-11-18 — SL Limit

- Menu principal **Meta diária → SL Limit → Pausas**, com ícone de filtro e permissão Resultados.
- Mesmo simulador aprovado: GATTO/GIO, histórico completo, 2024, 2025, 2026 e período crítico desde 10/09/2026; Op1, Op2, Op3 e todas as combinações. Exclusão estrita de tamanho stop maior que o corte; identidades preservadas.
- Resultados e SL GATTO vêm da carga atual do painel. Não incorpora resultados do mockup. GIO usa EXECUTADO PROTEGENDO do painel e seu próprio TAMANHO_STOP: campo da API quando existir, ou metadados verificados de GIOLVAN!E, com data e cobertura explícitas. Não usa stops GATTO para GIO.
- A API atual de GIO ainda não fornece SL: `corte-sl/gio-stops.js` contém somente metadados de stop, conferidos por ID, data, lado e resultados na preparação. Deve ser atualizado quando os stops de GIOLVAN forem corrigidos, até a API transmitir esse campo. Registros sem SL são mantidos e informados, sem imputação. Resultados novos do painel não são substituídos por snapshots.
- Ganhos sacrificados, perdas evitadas, médias/medianas, efeito líquido, resultado, DD por operação ou pregão, profit factor, comparações por janela, busca parametrizável de cortes, curvas e exportação CSV. DD recalculado desde zero para cada janela.
- Novo módulo em pasta própria `corte-sl/`; branch e PR dedicados. Sem alteração do motor de outros módulos.
