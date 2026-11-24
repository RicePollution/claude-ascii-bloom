# ascii-bloom

A Claude Code mod that turns the desktop app's background into a quiet garden of ASCII roses.

Shaded roses made only of characters (`. : - = + * # % @`) unfold, hold, then scatter into drifting specks, a few at a time, in different spots along the sides and top of the window. They're drawn live on the GPU, with every character colored from an ink-and-slate palette: Ink Black, Prussian Blue, Dusk Blue, Lavender Grey and Alabaster. The chat gets a matching dark theme with monospace text.

The background shows in the Claude desktop app. Terminals and editors don't draw themes. On mobile, or with reduced motion turned on, a simpler still version shows instead.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install ascii-bloom --marketplace RicePollution/claude-ascii-bloom
```

Answer `y` to add the marketplace, then pick a scope (user is the usual choice).

From a shell:

```
claude plugin install ascii-bloom --marketplace RicePollution/claude-ascii-bloom
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `RicePollution/claude-ascii-bloom`, then Add plugin.

## Credits

The background's characters are drawn from the pixel shapes of [Departure Mono](https://github.com/rektdeckard/departure-mono) by Helena Zhang, used under the SIL Open Font License 1.1.
