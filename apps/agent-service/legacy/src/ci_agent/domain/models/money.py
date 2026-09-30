"""MoneyFormat: how an amount appears in agent-written text (docs/adr/0007, a formatting-only domain exception).

The domain computes every amount in its internal money unit (1 unit = MONEY_UNIT_VND VND, T-03b). This value
object only changes how such an amount is written into text: signal and measurement summaries, guardrail
messages, strategy assumptions and notification bodies. It never changes a rule, threshold, constant or
computed number.

- MoneyFormat() (the default) writes the amount in internal units with the caller's historical format spec,
  so every existing text is reproduced exactly. The one exception is the scientific notation that the "g" spec
  would produce for amounts of a million or more (e.g. 1.07e+06): those are written in full instead.
- MoneyFormat(unit_vnd) writes VND, e.g. "1.072.300.000 ₫" for 42,892 units at 25,000 VND per unit.

Pure Python, deliberately without imports (the domain has no framework dependencies).
"""


class MoneyFormat:
    """Immutable: __slots__ leaves no instance dict, and assignment is blocked after construction."""

    __slots__ = ("unit_vnd",)

    def __init__(self, unit_vnd=None):
        if unit_vnd is not None and not unit_vnd > 0:
            raise ValueError("unit_vnd must be positive")
        object.__setattr__(self, "unit_vnd", unit_vnd)

    def __setattr__(self, name, value):
        raise AttributeError("MoneyFormat is immutable")

    def __delattr__(self, name):
        raise AttributeError("MoneyFormat is immutable")

    def __reduce__(self):  # copy/deepcopy/pickle rebuild through __init__, not through the blocked __setattr__
        return (MoneyFormat, (self.unit_vnd,))

    def text(self, amount, legacy_spec):
        """`amount` in internal units -> text. `legacy_spec` is the format spec the caller used before T-03c."""
        if self.unit_vnd is None:
            return _legacy(amount, legacy_spec)
        in_vnd = amount * self.unit_vnd
        if not _is_finite(in_vnd):
            # A non-finite amount (nan, inf, or one that overflows once converted) is written as it always was
            # instead of failing the phase that builds the text.
            return _legacy(amount, legacy_spec)
        vnd = round(in_vnd)
        grouped = format(abs(vnd), ",").replace(",", ".")
        return ("-" if vnd < 0 else "") + grouped + " ₫"

    def __eq__(self, other):
        return isinstance(other, MoneyFormat) and self.unit_vnd == other.unit_vnd

    def __hash__(self):
        return hash(("MoneyFormat", self.unit_vnd))

    def __repr__(self):
        return f"MoneyFormat({self.unit_vnd!r})" if self.unit_vnd is not None else "MoneyFormat()"


def _is_finite(amount):
    return amount - amount == 0  # 0 for every finite number; nan for nan and for +/-inf


def _legacy(amount, spec):
    text = format(amount, spec)
    if "e" in text:  # "g" switches to scientific notation from 1e6: write the number in full instead
        text = format(amount, ".2f").rstrip("0").rstrip(".")
    return text
