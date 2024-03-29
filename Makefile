# Makefile

DOCKER := $(shell command -v docker 2> /dev/null)
NODE := $(shell command -v node 2> /dev/null)
API_URL="http://localhost:3000"

create-dirs:
	@echo "Creating required directories..."
	sudo mkdir -p data/.icsValsetMonitoring_data || true
	sudo mkdir -p data/.grafana_data/data/alerting || true
	sudo mkdir -p data/.grafana_data/data/csv || true
	sudo mkdir -p data/.grafana_data/provisioning || true
	sudo chown -R 472:472 data/.grafana_data

install-docker:
ifndef DOCKER
	@echo "Installing Docker..."
	sudo apt update
	sudo apt install -y docker.io docker-compose jq
	sudo usermod -aG docker $$USER
endif

install-npm:
	@echo "Installing NPM..."
	sudo apt install -y npm

install-node:
ifndef NODE
	@echo "Installing NVM and Node.js..."
	curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
	export NVM_DIR="$$HOME/.nvm" ;\
	[ -s "$$NVM_DIR/nvm.sh" ] && \. "$$NVM_DIR/nvm.sh" ;\
	nvm install 18 --lts ;\
	nvm use 18
endif

docker-compose:
	@echo "Running Docker Compose..."
	docker-compose build

docker-up:
	@echo "Running Docker Compose Up..."
	docker-compose up -d

wait-for-containers:
	@echo "Waiting for Docker containers to be up..."
	@while [ "$$(docker-compose ps | awk '/Up/ {print $$0}' | wc -l)" -ne 3 ]; do \
		sleep 5; \
	done
	@echo "--- Setup complete! ---"
	@echo "Access Grafana and create admin user: http://localhost:3001"

docker-destroy:
	@echo "Destroying containers..."
	docker-compose down

reset-db:
	@echo "Running npm run reset-db in indexer-icsvalset container..."
	docker exec -it indexer-icsvalset npm run reset-db

config-validate:
	@echo "Validating configuration..."
	npm run config-validate

setup: create-dirs

run: install-docker install-npm install-node create-dirs docker-compose docker-up wait-for-containers

.PHONY: install-docker install-node install-npm docker-compose docker-up docker-destroy npm-reset-db config-validate setup run create-dirs
