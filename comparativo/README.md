# Comparativo GIO

O menu **Comparativo GIO** do painel principal contém quatro submenus: Visão comparativa, Resultados, Risco e estabilidade, Operações e dados. Eles compartilham uma instância do módulo e conservam seus filtros ao alternar de submenu. O módulo é estático, sem build nem dependências externas.

## Dados e atualização

O painel principal continua fazendo sua única requisição à API atual. `bridge.js` entrega o campo adicional `comparativoGio` (ou o nome anterior `comparativoProtegido`) ao módulo quando ele existir. Não há outra consulta à planilha, nem tentativa de juntar A:P com Q:Y por posição de linha. Cada registro GIO contém os dois resultados; somente pares numéricos entram nos cálculos, incluindo zero. IDs duplicados são rejeitados.

**A API existente não fornecia Q:Y na publicação desta integração.** Por isso há um corte incorporado de SETUP_GIO / PARA_SITE Q:Y, lido em 17/10/2026 no horário de São Paulo (364 operações, 283 replays concluídos, 81 pendentes). O aviso de origem e data é visível em todos os submenus. Os dados incorporados não são apresentados como uma conexão automática à planilha. Importação CSV/JSON atualiza a sessão e também muda o aviso de proveniência.

Para ativar atualização automática com uma única indexação, adicionar `apps-script.gs` ao projeto Apps Script que já atende o dashboard e acrescentar `payload.comparativoGio = buildComparativoGio_(spreadsheet)` ao construtor existente, usando a mesma instância da planilha. Não substituir o doGet nem remover seus campos. Publicar uma nova versão da implantação existente mantendo sua URL. O projeto Apps Script não faz parte deste repositório; a alteração não é realizada por estes arquivos GitHub.

Contrato aceito:

```json
{
  "sucesso": true,
  "geradoEm": "2026-10-18T01:45:00Z",
  "operacoes": [],
  "comparativoGio": [
    {"id":"OP_01-07-2024__1","date":"2024-07-01","side":"VENDA","original":-10,"protected":0,"improvement":10,"maximum":400}
  ]
}
```

Também é aceita a matriz Q:Y/A:I com ou sem cabeçalho. `protected: null` significa pendente; `protected: 0` significa replay concluído. Nunca converter vazio em zero. A lista `operacoes` acima é apenas uma ilustração do contrato; a API deve continuar fornecendo a base principal real.

## Navegação, acesso e apresentação

- O menu herda a permissão existente `resultados`; não exige uma nova permissão no backend. O acesso é controlado pela sessão do dashboard. A URL direta do módulo redireciona para o painel principal.
- O iframe é carregado apenas ao abrir o comparativo. Não replica a navegação lateral nem a autenticação. Mantém o tema selecionado no painel e informa sua altura ao pai, validando origem e janela.
- Os quatro submenus usam controles próprios porque a amostra pareada pode diferir da base principal. O toolbar da base principal fica oculto nessa seção.
- Mapas mensal/semanal: verde ou vermelho sólidos; zero neutro; sem replay indicado por “—”.
- Barras de resultado: original positivo azul, protegido positivo verde/turquesa, original negativo laranja, protegido negativo rosa/vermelho, zero neutro. Histogramas representam frequência e mantêm cores por método.
- Os campos `original` de GIO são a referência da comparação. Divergências de ID/resultado em relação à base principal ainda precisam ser conciliadas; o módulo não troca resultados silenciosamente.

## Verificação

`node --test comparativo/tests/*.test.cjs` verifica a entrega de payload, a navegação e permissões, mensagens do iframe, normalização de vazios/zero e cálculo pareado. Os scripts também podem ser checados com `node --check`. O módulo não publica dados de login nem inclui tokens ou credenciais.
