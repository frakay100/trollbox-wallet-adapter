import type { EventEmitter, SendTransactionOptions, WalletName } from '@solana/wallet-adapter-base';
import {
    BaseMessageSignerWalletAdapter,
    isIosAndRedirectable,
    isVersionedTransaction,
    scopePollingDetectionStrategy,
    WalletAccountError,
    WalletConnectionError,
    WalletDisconnectedError,
    WalletDisconnectionError,
    WalletError,
    WalletNotConnectedError,
    WalletNotReadyError,
    WalletPublicKeyError,
    WalletReadyState,
    WalletSendTransactionError,
    WalletSignMessageError,
    WalletSignTransactionError,
} from '@solana/wallet-adapter-base';
import type {
    Connection,
    SendOptions,
    Transaction,
    TransactionSignature,
    TransactionVersion,
    VersionedTransaction,
} from '@solana/web3.js';
import { PublicKey } from '@solana/web3.js';

interface TrollboxWalletEvents {
    connect(...args: unknown[]): unknown;
    disconnect(...args: unknown[]): unknown;
    accountChanged(newPublicKey: PublicKey): unknown;
}

interface TrollboxWallet extends EventEmitter<TrollboxWalletEvents> {
    isTrollbox?: boolean;
    publicKey?: { toBytes(): Uint8Array };
    isConnected: boolean;
    signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T>;
    signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]>;
    signAndSendTransaction<T extends Transaction | VersionedTransaction>(
        transaction: T,
        options?: SendOptions
    ): Promise<{ signature: TransactionSignature }>;
    signMessage(message: Uint8Array): Promise<{ signature: Uint8Array }>;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
}

interface TrollboxWindow extends Window {
    trollbox?: {
        solana?: TrollboxWallet;
    };
    solana?: TrollboxWallet;
}

declare const window: TrollboxWindow;

export interface TrollboxWalletAdapterConfig {}

export const TrollboxWalletName = 'Trollbox' as WalletName<'Trollbox'>;

export class TrollboxWalletAdapter extends BaseMessageSignerWalletAdapter {
    name = TrollboxWalletName;
    url = 'https://trollbox.io';
    icon =
        'data:image/png;base64,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';
    supportedTransactionVersions = new Set(['legacy', 0] as const) as ReadonlySet<TransactionVersion>;

    private _connecting: boolean;
    private _wallet: TrollboxWallet | null;
    private _publicKey: PublicKey | null;
    private _readyState: WalletReadyState =
        typeof window === 'undefined' || typeof document === 'undefined'
            ? WalletReadyState.Unsupported
            : WalletReadyState.NotDetected;

    constructor(config: TrollboxWalletAdapterConfig = {}) {
        super();
        this._connecting = false;
        this._wallet = null;
        this._publicKey = null;

        if (this._readyState !== WalletReadyState.Unsupported) {
            if (isIosAndRedirectable()) {
                // when in iOS (not webview), set Trollbox as loadable instead of checking for install
                this._readyState = WalletReadyState.Loadable;
                this.emit('readyStateChange', this._readyState);
            } else {
                scopePollingDetectionStrategy(() => {
                    if (window.trollbox?.solana?.isTrollbox || window.solana?.isTrollbox) {
                        this._readyState = WalletReadyState.Installed;
                        this.emit('readyStateChange', this._readyState);
                        return true;
                    }
                    return false;
                });
            }
        }
    }

    get publicKey() {
        return this._publicKey;
    }

    get connecting() {
        return this._connecting;
    }

    get readyState() {
        return this._readyState;
    }

    async autoConnect(): Promise<void> {
        // Skip autoconnect in the Loadable state
        // We can't redirect to a universal link without user input
        if (this.readyState === WalletReadyState.Installed) {
            await this.connect();
        }
    }

    async connect(): Promise<void> {
        try {
            if (this.connected || this.connecting) return;

            if (this.readyState === WalletReadyState.Loadable) {
                // redirect to the Trollbox /browse universal link
                // this will open the current URL in the Trollbox in-wallet browser
                const url = encodeURIComponent(window.location.href);
                const ref = encodeURIComponent(window.location.origin);
                window.location.href = `https://trollbox.app/ul/browse/${url}?ref=${ref}`;
                return;
            }

            if (this.readyState !== WalletReadyState.Installed) throw new WalletNotReadyError();

            this._connecting = true;

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const wallet = window.trollbox?.solana || window.solana!;

            if (!wallet.isConnected) {
                try {
                    await wallet.connect();
                } catch (error: any) {
                    throw new WalletConnectionError(error?.message, error);
                }
            }

            if (!wallet.publicKey) throw new WalletAccountError();

            let publicKey: PublicKey;
            try {
                publicKey = new PublicKey(wallet.publicKey.toBytes());
            } catch (error: any) {
                throw new WalletPublicKeyError(error?.message, error);
            }

            wallet.on('disconnect', this._disconnected);
            wallet.on('accountChanged', this._accountChanged);

            this._wallet = wallet;
            this._publicKey = publicKey;

            this.emit('connect', publicKey);
        } catch (error: any) {
            this.emit('error', error);
            throw error;
        } finally {
            this._connecting = false;
        }
    }

    async disconnect(): Promise<void> {
        const wallet = this._wallet;
        if (wallet) {
            wallet.off('disconnect', this._disconnected);
            wallet.off('accountChanged', this._accountChanged);

            this._wallet = null;
            this._publicKey = null;

            try {
                await wallet.disconnect();
            } catch (error: any) {
                this.emit('error', new WalletDisconnectionError(error?.message, error));
            }
        }

        this.emit('disconnect');
    }

    async sendTransaction<T extends Transaction | VersionedTransaction>(
        transaction: T,
        connection: Connection,
        options: SendTransactionOptions = {}
    ): Promise<TransactionSignature> {
        try {
            const wallet = this._wallet;
            if (!wallet) throw new WalletNotConnectedError();

            try {
                const { signers, ...sendOptions } = options;

                if (isVersionedTransaction(transaction)) {
                    signers?.length && transaction.sign(signers);
                } else {
                    transaction = (await this.prepareTransaction(transaction, connection, sendOptions)) as T;
                    signers?.length && (transaction as Transaction).partialSign(...signers);
                }

                sendOptions.preflightCommitment = sendOptions.preflightCommitment || connection.commitment;

                const { signature } = await wallet.signAndSendTransaction(transaction, sendOptions);
                return signature;
            } catch (error: any) {
                if (error instanceof WalletError) throw error;
                throw new WalletSendTransactionError(error?.message, error);
            }
        } catch (error: any) {
            this.emit('error', error);
            throw error;
        }
    }

    async signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> {
        try {
            const wallet = this._wallet;
            if (!wallet) throw new WalletNotConnectedError();

            try {
                return (await wallet.signTransaction(transaction)) || transaction;
            } catch (error: any) {
                throw new WalletSignTransactionError(error?.message, error);
            }
        } catch (error: any) {
            this.emit('error', error);
            throw error;
        }
    }

    async signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]> {
        try {
            const wallet = this._wallet;
            if (!wallet) throw new WalletNotConnectedError();

            try {
                return (await wallet.signAllTransactions(transactions)) || transactions;
            } catch (error: any) {
                throw new WalletSignTransactionError(error?.message, error);
            }
        } catch (error: any) {
            this.emit('error', error);
            throw error;
        }
    }

    async signMessage(message: Uint8Array): Promise<Uint8Array> {
        try {
            const wallet = this._wallet;
            if (!wallet) throw new WalletNotConnectedError();

            try {
                const { signature } = await wallet.signMessage(message);
                return signature;
            } catch (error: any) {
                throw new WalletSignMessageError(error?.message, error);
            }
        } catch (error: any) {
            this.emit('error', error);
            throw error;
        }
    }

    private _disconnected = () => {
        const wallet = this._wallet;
        if (wallet) {
            wallet.off('disconnect', this._disconnected);
            wallet.off('accountChanged', this._accountChanged);

            this._wallet = null;
            this._publicKey = null;

            this.emit('error', new WalletDisconnectedError());
            this.emit('disconnect');
        }
    };

    private _accountChanged = (newPublicKey: PublicKey) => {
        const publicKey = this._publicKey;
        if (!publicKey) return;

        try {
            newPublicKey = new PublicKey(newPublicKey.toBytes());
        } catch (error: any) {
            this.emit('error', new WalletPublicKeyError(error?.message, error));
            return;
        }

        if (publicKey.equals(newPublicKey)) return;

        this._publicKey = newPublicKey;
        this.emit('connect', newPublicKey);
    };
}
