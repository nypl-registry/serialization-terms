# serialization-terms
[![travis](https://travis-ci.org/nypl-registry/serialization-terms.svg)](https://travis-ci.org/nypl-registry/serialization-terms/)

Aggregates terms from host systems and serializes into lookup table and triple store.

####lib/shadowcat_serialize_viaf_terms (cluster)
`shadowcatSerializeTerms` - Builds/merges terms in shadowcat that are local and ones that are mapped to a VIAF identifier.	(should run 1st)