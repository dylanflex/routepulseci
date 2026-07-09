"""Unit tests for the pure duplicate-merge clustering (clustering.py)."""

from types import SimpleNamespace

import clustering

# ~0.001 deg latitude ≈ 111 m (within the 300 m radius); ~0.01 deg ≈ 1.1 km.
NEAR = 0.001
FAR = 0.01


def _inc(id, type="accident", lat=5.35, lng=-4.0, severity="blocked", confirmed=0):
    return SimpleNamespace(
        id=id,
        type=type,
        lat=lat,
        lng=lng,
        severity=severity,
        confirmed=confirmed,
        road="Bd Test",
    )


def test_same_type_nearby_reports_merge_into_one_cluster():
    incidents = [_inc("a"), _inc("b", lat=5.35 + NEAR)]
    clusters = clustering.cluster_incidents(incidents)
    assert len(clusters) == 1
    assert clusters[0]["size"] == 2
    assert set(clusters[0]["member_ids"]) == {"a", "b"}


def test_different_types_nearby_do_not_merge():
    incidents = [_inc("a", type="accident"), _inc("b", type="flood", lat=5.35 + NEAR)]
    clusters = clustering.cluster_incidents(incidents)
    assert len(clusters) == 2
    assert all(c["size"] == 1 for c in clusters)


def test_same_type_far_apart_do_not_merge():
    incidents = [_inc("a"), _inc("b", lat=5.35 + FAR)]
    clusters = clustering.cluster_incidents(incidents)
    assert len(clusters) == 2


def test_clustering_is_transitive():
    # A-B near, B-C near, but A-C just over the radius: still one cluster.
    incidents = [
        _inc("a", lat=5.350),
        _inc("b", lat=5.350 + 2 * NEAR),
        _inc("c", lat=5.350 + 4 * NEAR),
    ]
    clusters = clustering.cluster_incidents(incidents)
    assert len(clusters) == 1
    assert clusters[0]["size"] == 3


def test_representative_is_the_most_confirmed_member():
    incidents = [
        _inc("a", confirmed=1),
        _inc("b", lat=5.35 + NEAR, confirmed=9),
        _inc("c", lat=5.35 + 2 * NEAR, confirmed=3),
    ]
    cluster = clustering.cluster_incidents(incidents)[0]
    assert cluster["representative_id"] == "b"
    assert cluster["total_confirmed"] == 13


def test_cluster_severity_is_the_most_severe_member():
    incidents = [
        _inc("a", severity="dense"),
        _inc("b", lat=5.35 + NEAR, severity="danger"),
    ]
    assert clustering.cluster_incidents(incidents)[0]["severity"] == "danger"


def test_clusters_sorted_by_size_desc():
    incidents = [
        _inc("solo", type="flood", lat=5.40),
        _inc("a"),
        _inc("b", lat=5.35 + NEAR),
        _inc("c", lat=5.35 + 2 * NEAR),
    ]
    clusters = clustering.cluster_incidents(incidents)
    assert clusters[0]["size"] == 3
    assert clusters[-1]["size"] == 1
