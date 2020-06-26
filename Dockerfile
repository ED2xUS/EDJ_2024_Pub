FROM node:12-alpine

RUN mkdir -p /opt/app
ADD . /opt/app
WORKDIR /opt/app

RUN chown -R node:node /opt/app && \
    apk add --no-cache --virtual build-dependencies python make g++ && \
    npm install --no-cache && \
    npm run postinstall && \
    npm run env && \
    npm audit fix && \
    apk del build-dependencies

USER node

EXPOSE 1337

CMD ["node", "server.js"]