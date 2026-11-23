FROM node:24.16.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates python3 curl gnupg util-linux shellcheck restic && rm -rf /var/lib/apt/lists/*
# Disposable recovery rehearsal tools, following MongoDB's Debian 12 repository.
# https://www.mongodb.com/docs/v8.0/tutorial/install-mongodb-on-debian/
RUN curl -fsSL https://pgp.mongodb.com/server-8.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-8.0.gpg
RUN echo "deb [signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg] https://repo.mongodb.org/apt/debian bookworm/mongodb-org/8.0 main" > /etc/apt/sources.list.d/mongodb-org-8.0.list \
    && apt-get update && apt-get install -y --no-install-recommends mongodb-org-server mongodb-org-tools \
    && rm -rf /var/lib/apt/lists/*
RUN mkdir /test-tools && cd /test-tools && npm install --ignore-scripts --no-audit --no-fund mongodb@7.7.0
WORKDIR /repo
ENV UNIBASE_DEPLOY_TEST_CONTAINER=1
CMD ["python3", "-B", "-m", "unittest", "discover", "-s", "tests/deploy", "-v"]
