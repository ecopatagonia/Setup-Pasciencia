# Módulo Teste de Robustez

Port estático do mockup validado para GitHub Pages. O arquivo `robustez.js` já está compilado; GitHub Pages não precisa executar um build.

## Conexão de dados

O módulo usa exclusivamente as operações já carregadas pelo painel principal no cache compartilhado da sessão. Se esse cache não estiver disponível, orienta o usuário a voltar ao painel principal; nenhuma base adicional é solicitada pelo módulo.

O módulo não usa dados simulados como fallback. Se as operações não estiverem disponíveis, a tela informa o erro e não calcula métricas.

## Desenvolvimento

Os fontes legíveis ficam em `src/`. Para recompilar:

```sh
npm install
npm run build
```
