# Carrin App Backend

API de backend em Node.js com TypeScript e Prisma para o projeto Carrin, gerenciando o fluxo de pedidos de compras, catálogos de produtos e sincronização em tempo real entre clientes e parceiros.

## 🚀 Tecnologias

- **Node.js**
- **TypeScript**
- **Prisma ORM**
- **PostgreSQL** (Supabase)

## 🛠️ Instalação e Execução

1. Instale as dependências:
   ```bash
   npm install
   ```

2. Configure o arquivo `.env` na raiz do projeto com as credenciais do seu banco de dados:
   ```env
   DATABASE_URL="sua-conexao-postgres"
   ```

3. Sincronize o banco com o Prisma:
   ```bash
   npx prisma db push
   ```

4. Para rodar comandos e scripts durante o desenvolvimento:
   ```bash
   npx tsx <caminho-do-arquivo>
   ```
