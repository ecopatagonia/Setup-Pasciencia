# Módulo Teste de Robustez

Port estático do mockup validado para GitHub Pages. O arquivo `robustez.js` já está compilado; GitHub Pages não precisa executar um build.

## Conexão de dados

1. Publique `../apps-script/robustez.gs` como Aplicativo da Web a partir da planilha `WINFUT - 5min`.
2. Copie o URL terminado em `/exec`.
3. Substitua `COLE_AQUI_A_URL_DO_APPS_SCRIPT_DE_ROBUSTEZ` em `robustez-config.js`.

O módulo não usa dados simulados como fallback. Se a API não responder ou faltar uma coluna obrigatória, a tela informa o erro e não calcula métricas.

## Desenvolvimento

Os fontes legíveis ficam em `src/`. Para recompilar:

```sh
npm install
npm run build
```
