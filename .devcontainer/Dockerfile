FROM node:20-bullseye

ARG TZ
ENV TZ="$TZ"

# Install development tools
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
  && apt-get install -y --no-install-recommends \
  less \
  git \
  curl \
  wget \
  procps \
  sudo \
  fzf \
  zsh \
  man-db \
  unzip \
  ca-certificates \
  jq \
  nano \
  vim \
  poppler-utils \
  # Add GitHub CLI repository
  && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | gpg --dearmor -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
  && apt-get update \
  && apt-get install -y --no-install-recommends gh \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Go
ARG GO_VERSION=1.26.2
RUN ARCH="$(dpkg --print-architecture)" \
  && curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-${ARCH}.tar.gz" -o /tmp/go.tar.gz \
  && tar -C /usr/local -xzf /tmp/go.tar.gz \
  && rm /tmp/go.tar.gz
ENV PATH=/usr/local/go/bin:$PATH
ENV GOPATH=/home/node/go
ENV PATH=/home/node/go/bin:$PATH

# Ensure default node user has access to /usr/local/share and GOPATH
RUN mkdir -p /usr/local/share/npm-global /home/node/go && \
  chown -R node:node /usr/local/share /home/node/go

ARG USERNAME=node

# Persist bash history
RUN SNIPPET="export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
  && mkdir /commandhistory \
  && touch /commandhistory/.bash_history \
  && chown -R $USERNAME /commandhistory

# Set `DEVCONTAINER` environment variable
ENV DEVCONTAINER=true

# Create workspace and config directories
# Pre-create .vscode-server so named volume mounts don't create it as root
RUN mkdir -p /workspace /home/node/.claude /home/node/.codex /home/node/.vscode-server/data/User && \
  chown -R node:node /workspace /home/node/.claude /home/node/.codex /home/node/.vscode-server

WORKDIR /workspace

# Set up non-root user
USER node

# Set global packages path
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin

# Set the default shell to zsh
ENV SHELL=/bin/zsh

# Set the default editor
ENV EDITOR=nano
ENV VISUAL=nano

# Install Bun runtime
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH=/home/node/.bun/bin:$PATH

# Install Claude Code CLI
RUN curl -fsSL https://claude.ai/install.sh | bash

# Install Codex CLI
RUN npm install -g @openai/codex

# Install Starship prompt
RUN curl -fsSL https://starship.rs/install.sh | sh -s -- -y --bin-dir /home/node/.local/bin

# Add ~/.local/bin to PATH
ENV PATH=/home/node/.local/bin:$PATH
RUN echo 'export PATH="$HOME/.local/bin:$PATH"' >> /home/node/.bashrc && \
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> /home/node/.zshrc && \
    echo 'command -v starship &>/dev/null && eval "$(starship init bash)"' >> /home/node/.bashrc && \
    echo 'command -v starship &>/dev/null && eval "$(starship init zsh)"' >> /home/node/.zshrc
