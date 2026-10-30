#pragma once
#include "isolate/remote_handle.h"
#include "transferable.h"
#include <v8.h>
#include <memory>

namespace ivm {

class ContextHandle : public TransferableHandle {
	public:
		ContextHandle(RemoteHandle<v8::Context> context, RemoteHandle<v8::Value> global);
		static auto Definition() -> v8::Local<v8::FunctionTemplate>;
		auto TransferOut() -> std::unique_ptr<Transferable> final;

		auto GetContext() const -> RemoteHandle<v8::Context>;
		auto GlobalGetter() -> v8::Local<v8::Value>;
		auto Release() -> v8::Local<v8::Value>;

		template <int Async>
		auto Eval(v8::Local<v8::String> code, v8::MaybeLocal<v8::Object> maybe_options) -> v8::Local<v8::Value>;

		template <int Async>
		auto EvalClosure(
			v8::Local<v8::String> code,
			v8::Maybe<ArrayRange> maybe_arguments,
			v8::MaybeLocal<v8::Object> maybe_options
		) -> v8::Local<v8::Value>;

		template <int Async>
		auto SetPromiseHooks(
		    v8::Local<v8::Function> init_hook,
		    v8::Local<v8::Function> before_hook,
            v8::Local<v8::Function> after_hook,
            v8::Local<v8::Function> resolve_hook
        ) -> void;

		/**
		 * Creates and returns a native function that returns the nanoseconds elapsed since its own
		 * creation as a `Number`, read from `std::chrono::steady_clock` (monotonic wall time, not thread
		 * CPU time). The base time is kept in the function's data, so every returned function counts
		 * from the moment it was created. Nothing is defined on the global object: the caller decides
		 * who can reach the function.
		 *
		 * Calling contract (same as `setPromiseHooksSync`): call it from inside this context's own
		 * isolate, e.g. from `evalClosure` with the context passed in as an argument. The context is
		 * dereferenced on the calling thread; calling it from another isolate throws.
		 */
		auto InstallClock() -> v8::Local<v8::Value>;

	private:
		RemoteHandle<v8::Context> context;
		RemoteHandle<v8::Value> global;
		RemoteHandle<v8::Object> global_reference;
};

} // namespace ivm
