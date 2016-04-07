# serialization-terms
[![travis](https://travis-ci.org/nypl-registry/serialization-terms.svg)](https://travis-ci.org/nypl-registry/serialization-terms/)

Aggregates terms from host systems and serializes into lookup table and triple store. This lookup table is used when serializing the resources to assign the correct terms.

####lib/shadowcat_serialize_terms (cluster)
`shadowcatSerializeTerms` - Builds/merges terms in shadowcat that are local and ones that are mapped to a FAST identifier.	(should run 1st)

####lib/archives_serialize_collections_terms (cluster)
`archivesCollectionsSerializeTerms` - Archives Collection Terms from the `subjects` native JSON

####lib/archives_serialize_components_terms (cluster)
`archivesComponentsSerializeTerms` - Archives Components Terms from the `subjects` native JSON

####lib/mms_serialize_collections_terms (cluster)
`mmsCollectionsSerializeTerms` - MMS Collection Terms from the `subjects` native JSON

####lib/mms_serialize_containers_terms (cluster)
`mmsContainersSerializeTerms` - MMS Containers Terms from the `subjects` native JSON

####lib/mms_serialize_items_terms (cluster)
`mmsItemsSerializeTerms` - MMS Item Terms from the `subjects` native JSON

####lib/enumerate_terms (cluster)
`enumerateTerms` - Numbers all the terms in seq. order

####lib/prepare (cluster)
`prepareTerms` - Drops the terms lookup collection in registry-ingest