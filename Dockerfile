FROM arm32v7/node:10

COPY . .

CMD ["node","index.js"]
