default_target: local

COMMIT_HASH := $(shell git log -1 --pretty=format:"%h"|tail -1)
VERSION = 0.14

# include docker/*/*.mk

build-boards: $(BOARDS:%=build-%)

push-boards: $(BOARDS:%=push-%)

version:
	echo 'VERSION = "$(VERSION)-$(COMMIT_HASH)"' > vigision/version.py
