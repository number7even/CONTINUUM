# AMF operator commands — one command from zero to a reviewable draft, honest at the end.
# Run from apps/amf/worker/.
.PHONY: dogfood-voicecosmos dogfood odometer

# The whole A→I pipeline in one command (ingest → match+draft → queue for review),
# ending with the honest per-run odometer. Stops at the human review gate (P9).
dogfood-voicecosmos:
	@node dogfood.mjs --brand voicecosmos

# Same, for any product:  make dogfood BRAND=voiceidvault
dogfood:
	@node dogfood.mjs --brand $(BRAND)

# Just the honest state, no run.
odometer:
	@node odometer.mjs
