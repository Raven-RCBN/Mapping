package ai.agrinexus.mapintel;
import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
/** Android Keystore protects the persistent cookie. Passwords/financial rows are never stored. */
final class SecureSession {
 private final Context context; private static final String ALIAS="mapintel-session-v1";
 SecureSession(Context c){context=c.getApplicationContext();}
 private SecretKey key()throws Exception{KeyStore k=KeyStore.getInstance("AndroidKeyStore");k.load(null);if(!k.containsAlias(ALIAS)){KeyGenerator g=KeyGenerator.getInstance("AES","AndroidKeyStore");g.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build());g.generateKey();}return(SecretKey)k.getKey(ALIAS,null);}
 synchronized void save(String cookie)throws Exception{saveValue("session",cookie);}
 private void saveValue(String field,String cookie)throws Exception{Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,key());String iv=Base64.encodeToString(c.getIV(),Base64.NO_WRAP),body=Base64.encodeToString(c.doFinal(cookie.getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP);if(!context.getSharedPreferences("secure",0).edit().putString(field,iv+":"+body).commit())throw new Exception("Session storage unavailable");}
 synchronized String load(){return loadValue("session");}
 synchronized String workspace(){return loadValue("workspace");}
 synchronized void workspace(String value){try{saveValue("workspace",value);}catch(Exception ignored){}}
 synchronized void clearWorkspace(){context.getSharedPreferences("secure",0).edit().remove("workspace").commit();}
 private String loadValue(String field){try{String s=context.getSharedPreferences("secure",0).getString(field,null);if(s==null)return"";String[]p=s.split(":",2);Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(p[0],Base64.NO_WRAP)));return new String(c.doFinal(Base64.decode(p[1],Base64.NO_WRAP)),StandardCharsets.UTF_8);}catch(Exception e){clear();return"";}}
 synchronized void clear(){context.getSharedPreferences("secure",0).edit().clear().commit();try{KeyStore k=KeyStore.getInstance("AndroidKeyStore");k.load(null);if(k.containsAlias(ALIAS))k.deleteEntry(ALIAS);}catch(Exception ignored){}}
}
