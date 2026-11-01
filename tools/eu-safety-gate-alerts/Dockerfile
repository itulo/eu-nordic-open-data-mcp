FROM apify/actor-node:20
COPY package*.json ./
RUN npm --quiet set progress=false && npm install --omit=dev --omit=optional --no-audit --no-fund && rm -rf ~/.npm
COPY . ./
CMD ["node", "src/main.js"]
