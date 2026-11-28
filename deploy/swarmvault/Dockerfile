# SwarmVault trial: a read-only graph of the household wiki, next to LLMWIKI.
# SwarmVault is MIT licensed (https://github.com/swarmclawai/swarmvault).
FROM node:24.11.1-alpine3.22

RUN npm install -g --no-audit --no-fund @swarmvaultai/cli@3.20.0 \
 && npm cache clean --force \
 && apk add --no-cache tini

COPY entrypoint.sh /usr/local/bin/swarmvault-trial
RUN chmod 0755 /usr/local/bin/swarmvault-trial

ENV SWARMVAULT_NO_NOTICES=1 \
    VAULT_DIR=/vault \
    WIKI_DIR=/wiki \
    VIEWER_PORT=4123 \
    REFRESH_MINUTES=60

WORKDIR /vault
USER node
EXPOSE 4123
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/swarmvault-trial"]
