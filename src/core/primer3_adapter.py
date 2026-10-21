"""Local, bounded JSON adapter for Primer3-py melting-temperature calculation."""

from __future__ import annotations

import json
import math
import re
import sys

PARAMETER_LIMITS = {
    "mv_conc": (0.0, 1000.0),  # mM
    "dv_conc": (0.0, 100.0),  # mM
    "dntp_conc": (0.0, 100.0),  # mM
    "dna_conc": (0.0, 100000.0),  # nM; lower bound is exclusive
}


def analyze(payload: object) -> dict:
    if not isinstance(payload, dict):
        raise ValueError("La requête doit être un objet JSON.")
    allowed = {"sequence", *PARAMETER_LIMITS}
    if set(payload) != allowed:
        raise ValueError("Champs requis : sequence, mv_conc, dv_conc, dntp_conc, dna_conc.")
    raw_sequence = payload["sequence"]
    if not isinstance(raw_sequence, str):
        raise ValueError("La séquence doit être un texte.")
    sequence = re.sub(r"\s", "", raw_sequence)
    # Match ASCII before uppercasing: Unicode lookalikes must remain invalid.
    if not re.fullmatch(r"[ACGTacgt]{2,60}", sequence):
        raise ValueError("Primer3 attend une séquence ADN non ambiguë de 2 à 60 bases A, C, G ou T.")
    sequence = sequence.upper()

    parameters = {}
    for name, (minimum, maximum) in PARAMETER_LIMITS.items():
        value = payload[name]
        if type(value) not in (int, float) or not math.isfinite(value):
            raise ValueError(f"{name} doit être un nombre fini.")
        if not minimum <= value <= maximum or (name == "dna_conc" and value <= 0):
            raise ValueError(f"{name} hors limites : {minimum} à {maximum}; concentration ADN strictement positive.")
        parameters[name] = float(value)

    # SantaLucia salt correction uses log of the effective salt concentration.
    if parameters["mv_conc"] == 0 and parameters["dv_conc"] <= parameters["dntp_conc"]:
        raise ValueError("Le modèle requiert une concentration ionique effective strictement positive.")

    try:
        import primer3
    except ImportError as exc:
        raise RuntimeError("Primer3-py est indisponible dans l'environnement Python local.") from exc

    tm = primer3.calc_tm(
        sequence,
        **parameters,
        tm_method="santalucia",
        salt_corrections_method="santalucia",
        max_nn_length=60,
        dmso_conc=0.0,
        formamide_conc=0.0,
    )
    if not math.isfinite(tm):
        raise ValueError("Primer3 ne fournit pas de Tm finie pour ces paramètres.")
    return {
        "tm": tm,
        "engine": "primer3-py",
        "version": primer3.__version__,
        "method": "SantaLucia",
        "saltCorrection": "SantaLucia",
        "parameters": parameters,
    }


def analyze_pair(payload: object) -> dict:
    allowed = {"operation", "sequence1", "sequence2", "temp_c", *PARAMETER_LIMITS}
    if not isinstance(payload, dict) or set(payload) != allowed or payload["operation"] != "pair":
        raise ValueError("Champs de paire invalides.")
    temperature = payload["temp_c"]
    if type(temperature) not in (int, float) or not math.isfinite(temperature) or not 0 <= temperature <= 100:
        raise ValueError("La température d'évaluation doit être comprise entre 0 et 100 °C.")
    parameters = {name: payload[name] for name in PARAMETER_LIMITS}
    first = analyze({"sequence": payload["sequence1"], **parameters})
    second = analyze({"sequence": payload["sequence2"], **parameters})
    seq1 = re.sub(r"\s", "", payload["sequence1"]).upper()
    seq2 = re.sub(r"\s", "", payload["sequence2"]).upper()
    if len(seq1) == 60 and len(seq2) == 60:
        raise ValueError("Au moins une amorce doit contenir moins de 60 bases pour l'hétérodimère.")
    import primer3
    interaction = primer3.calc_heterodimer(seq1, seq2, **parameters, temp_c=temperature,
                                         max_loop=30, output_structure=True)
    found = bool(interaction.structure_found)
    if found and not all(math.isfinite(v) for v in (interaction.tm, interaction.dg)):
        raise ValueError("Primer3 ne fournit pas de résultat fini pour cette interaction.")
    return {
        "first": first, "second": second, "deltaTm": abs(first["tm"] - second["tm"]),
        "heterodimer": {"structureFound": found, "tm": interaction.tm if found else None,
                        "dgCalMol": interaction.dg if found else None,
                        "structure": interaction.ascii_structure if found else None},
        "temperature": float(temperature), "maxLoop": 30,
        "engine": "primer3-py", "version": primer3.__version__, "parameters": first["parameters"],
    }


def reject_constant(value: str) -> None:
    raise ValueError(f"Constante JSON non autorisée : {value}.")


def main() -> int:
    try:
        raw = sys.stdin.buffer.read(32769)
        if len(raw) > 32768:
            raise ValueError("Requête trop volumineuse (32 Ko maximum).")
        payload = json.loads(raw.decode("utf-8"), parse_constant=reject_constant)
        output = analyze_pair(payload) if isinstance(payload, dict) and payload.get("operation") == "pair" else analyze(payload)
        print(json.dumps(output, ensure_ascii=True, allow_nan=False))
        return 0
    except (ValueError, TypeError, OverflowError, RuntimeError) as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=True))
        return 1


if __name__ == "__main__":
    sys.exit(main())
