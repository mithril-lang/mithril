"""Host adapters. Model admission and native execution are separate receipts."""

class Refusal(ValueError):
    """Invalid input, unsupported semantics or unmet adapter prerequisites."""
