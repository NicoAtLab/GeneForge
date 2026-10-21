"""Run with a Python environment that has primer3-py, or local .python-deps."""

from __future__ import annotations

import importlib.util
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".python-deps"))
ADAPTER = ROOT / "src" / "core" / "primer3_adapter.py"
spec = importlib.util.spec_from_file_location("primer3_adapter", ADAPTER)
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)

import primer3


def request(**overrides):
    return {
        "sequence": "ACGTACGTACGTACGT",
        "mv_conc": 50,
        "dv_conc": 1.5,
        "dntp_conc": 0.6,
        "dna_conc": 50,
        **overrides,
    }


class Primer3AdapterTests(unittest.TestCase):
    def test_documented_reference_value_and_provenance(self):
        # Published Primer3-py quick-start reference, not a biological target.
        result = adapter.analyze(request(sequence="GTAAAACGACGGCCAGT"))
        self.assertAlmostEqual(result["tm"], 54.695494691112515, places=9)
        self.assertEqual(result["engine"], "primer3-py")
        self.assertEqual(result["version"], "2.3.1")
        self.assertEqual(result["method"], "SantaLucia")
        self.assertEqual(result["saltCorrection"], "SantaLucia")

    def test_parameters_reach_the_real_engine(self):
        payload = request(mv_conc=20, dv_conc=1, dntp_conc=0.2, dna_conc=10)
        result = adapter.analyze(payload)
        parameters = {name: payload[name] for name in adapter.PARAMETER_LIMITS}
        expected = primer3.calc_tm(payload["sequence"], **parameters,
                                  tm_method="santalucia", salt_corrections_method="santalucia")
        self.assertAlmostEqual(result["tm"], expected, places=12)
        self.assertEqual(result["parameters"], parameters)
        self.assertNotEqual(result["tm"], adapter.analyze(request())["tm"])

    def test_normalization_and_exact_nn_length_boundaries(self):
        self.assertEqual(adapter.analyze(request(sequence="acgt acgt\nacgt\tacgt")), adapter.analyze(request()))
        for sequence in ("AC", "ACGT" * 15):
            self.assertTrue(math.isfinite(adapter.analyze(request(sequence=sequence))["tm"]))
        for sequence in ("", "A", "A" * 61, "ACGN", "ACGU", "AC-GT", "ACG1T", "Aß", 123):
            with self.subTest(sequence=sequence), self.assertRaises(ValueError):
                adapter.analyze(request(sequence=sequence))

    def test_concentration_validation(self):
        for key in adapter.PARAMETER_LIMITS:
            for value in (-1, float("nan"), float("inf"), True, "50", None, 100001):
                with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                    adapter.analyze(request(**{key: value}))
        with self.assertRaises(ValueError):
            adapter.analyze(request(dna_conc=0))
        with self.assertRaises(ValueError):
            adapter.analyze(request(mv_conc=0, dv_conc=0))
        with self.assertRaises(ValueError):
            adapter.analyze(request(mv_conc=0, dv_conc=0.6, dntp_conc=0.6))

    def test_request_shape_is_strict(self):
        for payload in (None, [], {}, {**request(), "extra": 1}):
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                adapter.analyze(payload)

    def run_adapter(self, body):
        env = {**os.environ, "PYTHONPATH": str(ROOT / ".python-deps"), "PYTHONDONTWRITEBYTECODE": "1"}
        return subprocess.run([sys.executable, str(ADAPTER)], input=body, text=True,
                              capture_output=True, env=env, timeout=10, check=False)

    def test_json_stdio_protocol(self):
        result = self.run_adapter(json.dumps(request()))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), adapter.analyze(request()))
        self.assertEqual(result.stderr, "")

    def test_json_errors_are_machine_readable(self):
        for body in ('{"sequence":', "null", json.dumps(request(dna_conc=float("nan"))), " " * 32769):
            with self.subTest(body=body[:60]):
                result = self.run_adapter(body)
                self.assertEqual(result.returncode, 1)
                self.assertIsInstance(json.loads(result.stdout)["error"], str)
                self.assertEqual(result.stderr, "")

    def test_pair_matches_real_engine_for_both_tm_and_heterodimer(self):
        first, second = "ACGTTGCAAGTCGATCGT", "ACGATCGACTTGCAACGT"
        conditions = {name: request()[name] for name in adapter.PARAMETER_LIMITS}
        payload = {"operation": "pair", "sequence1": first, "sequence2": second, "temp_c": 37, **conditions}
        result = adapter.analyze_pair(payload)
        expected = primer3.calc_heterodimer(first, second, **conditions, temp_c=37, max_loop=30, output_structure=True)
        self.assertEqual(result["first"], adapter.analyze(request(sequence=first)))
        self.assertEqual(result["second"], adapter.analyze(request(sequence=second)))
        self.assertAlmostEqual(result["deltaTm"], abs(result["first"]["tm"] - result["second"]["tm"]))
        self.assertEqual(result["heterodimer"]["structureFound"], expected.structure_found)
        self.assertAlmostEqual(result["heterodimer"]["dgCalMol"], expected.dg, places=9)
        self.assertEqual(json.loads(self.run_adapter(json.dumps(payload)).stdout), result)

    def test_pair_rejects_invalid_second_oligo_and_temperature(self):
        payload = {"operation": "pair", "sequence1": "ACGTACGT", "sequence2": "TGCATGCA", "temp_c": 37,
                   **{name: request()[name] for name in adapter.PARAMETER_LIMITS}}
        for changes in ({"sequence2": "ACGN"}, {"temp_c": True}, {"temp_c": 101},
                        {"sequence1": "A" * 60, "sequence2": "T" * 60}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                adapter.analyze_pair({**payload, **changes})


if __name__ == "__main__":
    unittest.main(verbosity=2)
