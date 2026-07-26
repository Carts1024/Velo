use soroban_sdk::{map, symbol_short, vec, Bytes, BytesN, Env, Error, IntoVal, String, Val};
use velo_playground_collections::{CollectionError, CollectionsFixture, CollectionsFixtureClient};

#[test]
fn bytes_fixed_bytes_and_strings_round_trip() {
    let env = Env::default();
    let contract_id = env.register(CollectionsFixture, ());
    let client = CollectionsFixtureClient::new(&env, &contract_id);
    let bytes = Bytes::from_slice(&env, &[0, 1, 2, 255]);
    let fixed = BytesN::from_array(&env, &[7; 32]);
    let string = String::from_str(&env, "Velo Playground");
    let value: Val = 42u32.into_val(&env);
    let error = Error::from_contract_error(7);

    assert!(client.accept_value(&value));
    assert!(client.accept_error(&error));
    assert!(client.echo_bool(&true));
    assert_eq!(client.echo_string(&string), string);
    assert_eq!(client.echo_bytes(&bytes), bytes);
    assert_eq!(client.echo_fixed(&fixed), fixed);
}

#[test]
fn recursive_collections_tuple_and_option_round_trip() {
    let env = Env::default();
    let contract_id = env.register(CollectionsFixture, ());
    let client = CollectionsFixtureClient::new(&env, &contract_id);
    let values = vec![&env, 1u32, 2, u32::MAX];
    let values_by_name = map![
        &env,
        (symbol_short!("first"), i128::MIN),
        (symbol_short!("last"), i128::MAX),
    ];
    let pair = (-42, symbol_short!("Velo"));

    assert_eq!(client.echo_vec(&values), values);
    assert_eq!(client.echo_map(&values_by_name), values_by_name);
    assert_eq!(client.echo_tuple(&pair), pair);
    assert_eq!(client.echo_option(&Some(42)), Some(42));
    assert_eq!(client.echo_option(&None), None);
}

#[test]
fn result_success_and_error_paths_are_explicit() {
    let env = Env::default();
    let contract_id = env.register(CollectionsFixture, ());
    let client = CollectionsFixtureClient::new(&env, &contract_id);

    assert_eq!(client.echo_result(&42, &false), 42);
    assert_eq!(
        client.try_echo_result(&42, &true).unwrap_err().unwrap(),
        CollectionError::RequestedFailure
    );
}
