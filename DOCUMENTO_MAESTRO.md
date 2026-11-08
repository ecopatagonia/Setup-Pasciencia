# O Pulo do Gatto — Documento Maestro

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
