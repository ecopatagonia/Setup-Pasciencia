# Módulo Teste de Robustez

Port estático do mockup validado para GitHub Pages. O arquivo `robustez.js` já está compilado; GitHub Pages não precisa executar um build.

## Conexão de dados

O módulo usa primeiro as operações já carregadas pelo painel principal no cache compartilhado da sessão. Se esse cache não estiver disponível, busca somente a base de operações principal; a base de mercado de 5 minutos não é carregada.

O módulo não usa dados simulados como fallback. Se as operações não estiverem disponíveis, a tela informa o erro e não calcula métricas.

## Desenvolvimento

Os fontes legíveis ficam em `src/`. Para recompilar:

```sh
npm install
npm run build
```
