from abc import ABC, abstractmethod


class BrowserAdapter(ABC):
    browser_id = ""
    display_name = ""

    def __init__(self, runner):
        self.runner = runner

    @abstractmethod
    def detect(self, platform):
        raise NotImplementedError

    @abstractmethod
    def capabilities(self, installation):
        raise NotImplementedError

    @abstractmethod
    def read_managed_state(self, installation):
        raise NotImplementedError

    @abstractmethod
    def plan(self, profile, installation, current_state):
        raise NotImplementedError
