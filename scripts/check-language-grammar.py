#!/usr/bin/env python3
"""Consistency checks for the published Mithril form grammar.

String-only checks cannot see an unreachable production or a token rule that
contradicts its own refusal prose. This script parses grammar.ebnf and fails on:

  * a production no entry point reaches
  * a reference to an undefined production
  * an integer token the production admits while the prose refuses it

Usage: check-language-grammar.py site/lang.mithril.fund/grammar.ebnf
"""

import re
import sys

ENTRIES = ("form-source", "versioned-source")

INTEGER_ACCEPTED = ("0", "42", "-12", "+42", "0x1f", "-0XFF", "9223372036854775807")
INTEGER_REFUSED = ("", "-", "+", "0377", "00", "2r1010", "42N", "1e5", "0x", "1.5", "0b101")

QUOTED = re.compile(r"'(?:[^']*)'|\"(?:[^\"\\]|\\.)*\"")
DEFINITION = re.compile(r"^([a-z][a-z0-9-]*)[ \t]*=[ \t]*(.*?)(?=^[a-z][a-z0-9-]*[ \t]*=|\Z)", re.S | re.M)
TOKEN = re.compile(r"'(?:[^']*)'|\"(?:[^\"\\]|\\.)*\"|…|[\[\]{}()|]|[a-z][a-z0-9-]*|[^\s,]")


def strip_comments(text):
    out, i = [], 0
    while True:
        start = text.find("(*", i)
        if start < 0:
            out.append(text[i:])
            return "".join(out)
        end = text.find("*)", start + 2)
        if end < 0:
            raise ValueError("unterminated (* comment")
        out.append(text[i:start])
        out.append(" ")
        i = end + 2


def strip_prose(text):
    """Drop `? ... ?` spans, which are prose, not grammar productions."""
    spans = []

    def hold(match):
        spans.append(match.group(0))
        return "\x00%d\x00" % (len(spans) - 1)

    text = QUOTED.sub(hold, text)
    text = re.sub(r"\?.*?\?", " ", text, flags=re.S)
    return re.sub(r"\x00(\d+)\x00", lambda m: spans[int(m.group(1))], text)


def unquote(token):
    body = token[1:-1]
    if token[0] == '"':
        return re.sub(r"\\(.)", r"\1", body)
    return body


class Parser:
    def __init__(self, tokens):
        self.tokens = tokens
        self.pos = 0

    def peek(self):
        return self.tokens[self.pos] if self.pos < len(self.tokens) else None

    def take(self):
        token = self.tokens[self.pos]
        self.pos += 1
        return token

    def expr(self):
        alternatives = [self.term()]
        while self.peek() == "|":
            self.take()
            alternatives.append(self.term())
        return alternatives

    def term(self):
        factors = []
        while self.peek() not in (None, "|", "]", ")", "}"):
            if self.peek() == "…":
                self.take()
                low = factors.pop()
                high = self.take()
                if low[0] != "lit" or not high.startswith(("'", '"')):
                    raise ValueError("malformed range around '…'")
                factors.append(("range", low[1], unquote(high)))
                continue
            factors.append(self.factor())
        return factors

    def factor(self):
        token = self.take()
        if token == "[":
            node = ("opt", self.expr())
            self.expect("]")
            return node
        if token == "{":
            node = ("rep", self.expr())
            self.expect("}")
            return node
        if token == "(":
            node = ("group", self.expr())
            self.expect(")")
            return node
        if token.startswith(("'", '"')):
            return ("lit", unquote(token))
        if re.fullmatch(r"[a-z][a-z0-9-]*", token):
            return ("ident", token)
        raise ValueError("unexpected token %r" % token)

    def expect(self, token):
        actual = self.take()
        if actual != token:
            raise ValueError("expected %r, found %r" % (token, actual))


def parse(text):
    table = {}
    for match in DEFINITION.finditer(text):
        name, rhs = match.group(1), match.group(2).strip()
        if name in table:
            raise ValueError("duplicate production %r" % name)
        rhs = rhs.rstrip(";").strip()
        table[name] = Parser(TOKEN.findall(rhs)).expr()
    return table


def references(expr):
    for alternative in expr:
        for factor in alternative:
            kind = factor[0]
            if kind == "ident":
                yield factor[1]
            elif kind in ("opt", "rep", "group"):
                yield from references(factor[1])


def render_expr(expr, table, stack):
    return "|".join("".join(render_factor(f, table, stack) for f in alt) for alt in expr)


def render_factor(factor, table, stack):
    kind = factor[0]
    if kind == "lit":
        return re.escape(factor[1])
    if kind == "range":
        return "[%s-%s]" % (re.escape(factor[1]), re.escape(factor[2]))
    if kind == "ident":
        name = factor[1]
        if name in stack:
            raise ValueError("recursive production %r cannot be rendered" % name)
        return "(?:%s)" % render_expr(table[name], table, stack + (name,))
    inner = render_expr(factor[1], table, stack)
    if kind == "group":
        return "(?:%s)" % inner
    if kind == "opt":
        return "(?:%s)?" % inner
    if kind == "rep":
        return "(?:%s)*" % inner
    raise ValueError("unknown node %r" % (kind,))


def check(path):
    with open(path, encoding="utf-8") as handle:
        text = strip_prose(strip_comments(handle.read()))
    table = parse(text)
    errors = []

    for name in ENTRIES:
        if name not in table:
            errors.append("entry production %r is missing" % name)

    for name, expr in table.items():
        for ref in references(expr):
            if ref not in table:
                errors.append("%s references undefined production %s" % (name, ref))

    reached, frontier = set(ENTRIES), list(ENTRIES)
    while frontier:
        for ref in references(table.get(frontier.pop(), [])):
            if ref in table and ref not in reached:
                reached.add(ref)
                frontier.append(ref)
    for name in sorted(set(table) - reached):
        errors.append("production %s is unreachable from %s" % (name, " or ".join(ENTRIES)))

    if "integer" in table:
        integer = re.compile("(?:%s)" % render_expr(table["integer"], table, ("integer",)))
        for token in INTEGER_ACCEPTED:
            if not integer.fullmatch(token):
                errors.append("integer refuses %r but the token layer admits it" % token)
        for token in INTEGER_REFUSED:
            if integer.fullmatch(token):
                errors.append("integer admits %r but the prose refuses it" % token)

    return len(table), errors


def main():
    if len(sys.argv) != 2:
        print(__doc__.strip().splitlines()[-1], file=sys.stderr)
        return 2
    try:
        count, errors = check(sys.argv[1])
    except (OSError, ValueError) as error:
        print("%s: %s" % (sys.argv[1], error), file=sys.stderr)
        return 1
    for error in errors:
        print("%s: %s" % (sys.argv[1], error), file=sys.stderr)
    if errors:
        return 1
    print("%s: %d productions, all reachable, integer tokens as documented" % (sys.argv[1], count))
    return 0


if __name__ == "__main__":
    sys.exit(main())
