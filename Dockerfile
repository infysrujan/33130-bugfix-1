FROM mcr.microsoft.com/playwright:v1.53.1-jammy

WORKDIR /app

# Install root dependencies
COPY package*.json ./
RUN npm ci --ignore-scripts

# Install inner package dependencies
COPY tools/visual-tests/package*.json ./tools/visual-tests/
RUN cd tools/visual-tests && npm i --ignore-scripts

RUN npx playwright install --with-deps chromium

# Copy source (snapshot dirs are volume-mounted at runtime)
COPY . .

RUN chmod +x docker-entrypoint.sh
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npx", "playwright", "test"]