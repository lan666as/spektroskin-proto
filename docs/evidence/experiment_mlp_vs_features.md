# Experiment: neural network on raw maps vs engineered features (simulated data)

Generated 2026-10-24 22:27 UTC on top of commit `773d1e1` with
`uv run python -m scripts.experiment_mlp` (deterministic). Not deployed.

**Question:** does a small neural network that sees the pigment and blood maps directly (two
32×32 crops around the lesion, 2048 inputs, one hidden layer of 64 units,
scikit-learn MLP) beat the deployed model, which uses 12 engineered lesion-vs-skin statistics?

Same simulated lesions and the same held-out split as the deployed triage model
(891 train, 445 held out).

| Held-out accuracy | Deployed (12 features, logistic regression) | Neural network (raw maps) |
|---|---|---|
| All | 0.98 | 0.93 |
| light (III) | 0.99 | 0.93 |
| medium (IV) | 0.98 | 0.94 |
| dark (V) | 0.96 | 0.91 |

**Decision:** the deployed model stays. It is more accurate (0.98 vs 0.93),
and every suggestion it makes can be explained in named, measurable terms ("high blood excess"), it
abstains and guards against out-of-range input, and it is calibrated. A neural network earns its
place with real images, where hand-made statistics miss texture and structure; this is where the
roadmap's image encoder comes in.
