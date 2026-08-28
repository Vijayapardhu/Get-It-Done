/// One line of address, for a header that has about thirty characters.
///
/// Google returns the full postal address, which is right for dispatch and far
/// too long for a strip above a greeting: "3-83, Valuthimmapuram, Surampalem,
/// Andhra Pradesh 533437, India" arrives already truncated to "…Andhra Pra…",
/// which shows the user the two least useful words in the string.
///
/// So drop what a local reader does not need — the country, the postcode, the
/// state — and keep the first parts that remain, which is the house and the
/// neighbourhood: "3-83, Valuthimmapuram".
///
/// Deliberately dependency-free so both the model and the location layer can
/// use it without importing each other.
String shortenAddress(String address, {int parts = 2}) {
  final segments = address
      .split(',')
      .map((part) => part.trim())
      // "Andhra Pradesh 533437" and a bare "533437" are both postcode noise.
      .map((part) => part.replaceAll(RegExp(r'\b\d{6}\b'), '').trim())
      .where((part) => part.isNotEmpty)
      .where((part) => part.toLowerCase() != 'india')
      .where((part) => !_indianStates.contains(part.toLowerCase()))
      .toList();

  if (segments.isEmpty) return address.trim();
  return segments.take(parts).join(', ');
}

/// Only the states that actually appear in an address line here. A complete
/// list would be dead weight; this one exists to strip "Andhra Pradesh" from
/// the middle of an address whose city is already in it.
const _indianStates = {
  'andhra pradesh', 'telangana', 'tamil nadu', 'karnataka', 'kerala',
  'maharashtra', 'gujarat', 'rajasthan', 'madhya pradesh', 'uttar pradesh',
  'bihar', 'west bengal', 'odisha', 'punjab', 'haryana', 'delhi', 'goa',
  'assam', 'jharkhand', 'chhattisgarh', 'uttarakhand', 'himachal pradesh',
};
