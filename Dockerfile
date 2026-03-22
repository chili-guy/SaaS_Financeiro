# Usa uma versão leve do Node.js v20
FROM node:20-alpine

# Cria a pasta de trabalho dentro do container
WORKDIR /app

# Copia os arquivos de dependência primeiro (isso acelera futuros builds)
COPY package.json ./

# Instala os pacotes
RUN npm install

# Copia o restante dos arquivos do seu projeto
COPY . .

# A porta padrão do nosso arquivo server.js
EXPOSE 8080

# O comando clássico para iniciar a nossa mágica
CMD ["npm", "start"]
